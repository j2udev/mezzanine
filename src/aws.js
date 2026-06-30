// AWS provider data layer - the structural twin of src/k8s.js, but built around an internal
// SERVICES registry so that adding RDS / Lambda / IAM / VPC / ... later is ONE table entry
// instead of a fork through every switch. (mezza9 "module #2": see modules.md for the running
// friction log this build is generating toward an eventual cross-provider plugin interface.)
//
// 3-tier fallback, mirroring k8s.js: live AWS (default credential chain) -> mock (MEZZ_AWS_DEMO)
// -> empty. The AWS SDK v3 is imported LAZILY (dynamic import inside loadSdk), so a build/run with
// neither the deps installed nor credentials present still boots cleanly and serves empty/mock.

import { getMockAwsResources, getMockS3Objects, getMockS3Object, getMockAwsDescribe, getMockAwsRelated } from './aws-mock.js'

// Demo gate is SEPARATE from k8s MEZZ_DEMO on purpose: the two providers have independent
// connection/health state (you may run live k8s + mock AWS, or vice versa). One global demoMode
// boolean cannot express that - flagged in modules.md as a provider-boundary requirement.
const DEMO = !!process.env.MEZZ_AWS_DEMO &&
  process.env.MEZZ_AWS_DEMO !== '0' && process.env.MEZZ_AWS_DEMO !== 'false'

// Single-region first (decided with the user): one region, no region picker yet. EC2 is
// strictly per-region; S3 ListBuckets is global but each bucket has a home region. The absent
// region axis is the cleanest entry in the friction log - it points straight at the future
// provider "scope axis" abstraction (the generic replacement for k8s 'namespace').
//
// Region resolution follows AWS_PROFILE: an explicit AWS_REGION / AWS_DEFAULT_REGION always wins,
// but otherwise we DON'T pin a region on the clients - we let the SDK resolve it from the active
// profile's `region` (so a GovCloud profile talks to its gov partition instead of being force-
// pinned to us-east-1, which would break STS/EC2 across partitions). REGION holds the *effective*
// region for display + row-stamping: it starts as the override (or a us-east-1 placeholder for the
// pre-connect empty/mock view) and is updated to the SDK-resolved value on first successful
// connect. Switching AWS_PROFILE takes effect on a server restart (clients are cached, like k8s.js).
const REGION_OVERRIDE = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || null
let REGION = REGION_OVERRIDE || 'us-east-1'

// Only touch AWS at all when it is plausibly configured - otherwise the 5s refresh would hammer
// STS on every tick in a pure-k8s devcontainer. Enabled by demo, an explicit opt-in, or any of the
// standard credential-source env vars (so real deployments auto-enable).
const AWS_ENABLED = DEMO ||
  (!!process.env.MEZZ_AWS && process.env.MEZZ_AWS !== '0' && process.env.MEZZ_AWS !== 'false') ||
  !!(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE || process.env.AWS_ROLE_ARN ||
     process.env.AWS_WEB_IDENTITY_TOKEN_FILE || process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI)

// Resource keys this module contributes to the shared data stream (peer of k8s RESOURCE_KEYS).
// s3objects is intentionally NOT here: it is a lazy drilldown (fetchS3Objects), never broadcast.
export const RESOURCE_KEYS = [
  's3buckets', 'ec2instances', 'ebsvolumes', 'lambdafunctions',
  'vpcs', 'securitygroups', 'elasticips',
]

const MAX_OBJECTS = 2000   // cap a single bucket listing (friction: huge buckets need a prefix UI)

let cachedClients = null
let identity = null
let lastError = null

function emptyAwsResources(err) {
  const out = { awsConnected: false, awsDemo: false, awsRegion: REGION, awsIdentity: null, awsError: err || null }
  for (const k of RESOURCE_KEYS) out[k] = []
  return out
}

// Lazy SDK import. Failure here (deps not installed) is caught by getClients() and degrades to
// mock/empty - which is exactly why demo mode works with no @aws-sdk/* present.
let sdk = null
async function loadSdk() {
  if (sdk) return sdk
  const [s3, ec2, sts, lambda] = await Promise.all([
    import('@aws-sdk/client-s3'),
    import('@aws-sdk/client-ec2'),
    import('@aws-sdk/client-sts'),
    import('@aws-sdk/client-lambda'),
  ])
  sdk = { s3, ec2, sts, lambda }
  return sdk
}

// Mirror k8s.js getClient(): build the clients from the default credential chain, validate with a
// 5s-capped STS GetCallerIdentity, cache on success, return null (and remember lastError) on any
// failure. Unlike kc.getCurrentCluster() (a server URL), AWS identity is an ARN + account id.
async function getClients() {
  if (!AWS_ENABLED) { lastError = 'AWS not configured'; return null }
  if (cachedClients) return cachedClients
  try {
    const { s3, ec2, sts, lambda } = await loadSdk()
    // Only pin region when explicitly overridden; otherwise leave it unset so the SDK resolves it
    // from the active profile (AWS_PROFILE) - critical for non-us-east-1 / GovCloud profiles.
    const cfg = REGION_OVERRIDE ? { region: REGION_OVERRIDE } : {}
    const stsClient = new sts.STSClient(cfg)
    identity = await Promise.race([
      stsClient.send(new sts.GetCallerIdentityCommand({})),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AWS STS timeout after 5s')), 5000)),
    ])
    // Resolve the region the SDK actually settled on (from the profile, if no override) so the UI
    // and row stamping reflect reality. config.region is an async provider; fall back to REGION.
    try { REGION = REGION_OVERRIDE || await stsClient.config.region() || REGION } catch { /* keep current REGION */ }
    cachedClients = {
      s3: new s3.S3Client(cfg), ec2: new ec2.EC2Client(cfg), sts: stsClient,
      lambda: new lambda.LambdaClient(cfg), region: REGION,
    }
    lastError = null
    const prof = process.env.AWS_PROFILE ? `, profile ${process.env.AWS_PROFILE}` : ''
    console.log(`  ✓ AWS connected: ${identity.Arn} (account ${identity.Account}, region ${REGION}${prof})`)
    return cachedClients
  } catch (err) {
    lastError = err.message
    cachedClients = null
    identity = null
    return null
  }
}

// ── Internal AWS service registry ────────────────────────────────────────────
// One entry per AWS resource type. list(clients) returns normalized FLAT TABLE ROWS (not raw API
// shapes), each carrying a synthetic `status` string so the shared ResourceRow can call
// statusColor(item.status) unconditionally. To add a service (RDS, Lambda, ...) add one entry here
// plus its presentation entry in the client registry (client/src/aws/resources.js). Nothing else.
const SERVICES = [
  {
    key: 's3buckets',
    async list(clients) {
      const { s3 } = await loadSdk()
      const out = await clients.s3.send(new s3.ListBucketsCommand({}))
      const buckets = out.Buckets || []
      return Promise.all(buckets.map(async (b) => {
        let region = REGION
        try {
          const loc = await clients.s3.send(new s3.GetBucketLocationCommand({ Bucket: b.Name }))
          region = loc.LocationConstraint || 'us-east-1'   // '' constraint == us-east-1 by API contract
        } catch { /* listing buckets you can't locate is fine - keep the default region */ }
        return {
          id: b.Name, name: b.Name, region,
          created: b.CreationDate ? b.CreationDate.toISOString() : '',
          age: age(b.CreationDate),
          objects: '-', size: '-',     // counting objects/size is a per-bucket scan; deferred (lazy drill shows them)
          status: 'Active',
        }
      }))
    },
    // Inspect (module #2): aggregate a bucket's config from several Get* calls into one object.
    // Each sub-call is optional - an unset versioning/encryption/policy returns a 404 we swallow.
    async describe(clients, id) {
      const { s3 } = await loadSdk()
      const detail = { Name: id }
      const safe = async (label, fn) => { try { detail[label] = await fn() } catch { /* optional / unset */ } }
      await safe('LocationConstraint', async () => (await clients.s3.send(new s3.GetBucketLocationCommand({ Bucket: id }))).LocationConstraint || 'us-east-1')
      await safe('Versioning',         async () => { const v = await clients.s3.send(new s3.GetBucketVersioningCommand({ Bucket: id })); return { Status: v.Status || 'Disabled', MFADelete: v.MFADelete || 'Disabled' } })
      await safe('Encryption',         async () => (await clients.s3.send(new s3.GetBucketEncryptionCommand({ Bucket: id }))).ServerSideEncryptionConfiguration)
      await safe('PublicAccessBlock',  async () => (await clients.s3.send(new s3.GetPublicAccessBlockCommand({ Bucket: id }))).PublicAccessBlockConfiguration)
      await safe('PolicyStatus',       async () => (await clients.s3.send(new s3.GetBucketPolicyStatusCommand({ Bucket: id }))).PolicyStatus)
      await safe('Acl',                async () => { const a = await clients.s3.send(new s3.GetBucketAclCommand({ Bucket: id })); return { Owner: a.Owner, Grants: a.Grants } })
      await safe('Tags',              async () => (await clients.s3.send(new s3.GetBucketTaggingCommand({ Bucket: id }))).TagSet)
      return detail
    },
    // Related resources (phase 1): the bucket-config edges that point at a target mezzanine already
    // broadcasts - the log-target bucket, replication-destination bucket(s), and notification Lambda
    // functions. Each Get* is optional (an unconfigured bucket throws NoSuch*, swallowed). Lambda
    // links carry the function ARN as id (matches the lambdafunctions row id = FunctionArn); bucket
    // links carry the bare bucket name (= s3buckets row id). The store guards each on the target
    // existing in the current data stream (cross-account/region targets won't be present).
    async related(clients, id) {
      const { s3 } = await loadSdk()
      const links = []
      const safe = async (fn) => { try { return await fn() } catch { return null } }
      // Server access logging -> target bucket.
      const log = await safe(() => clients.s3.send(new s3.GetBucketLoggingCommand({ Bucket: id })))
      const logTarget = log?.LoggingEnabled?.TargetBucket
      if (logTarget) links.push({ resource: 's3buckets', id: logTarget, name: logTarget, relation: 'log target' })
      // Replication -> destination bucket(s). Destination.Bucket is an ARN (arn:aws:s3:::name).
      const rep = await safe(() => clients.s3.send(new s3.GetBucketReplicationCommand({ Bucket: id })))
      for (const rule of rep?.ReplicationConfiguration?.Rules || []) {
        const arn = rule.Destination?.Bucket
        const name = arn ? arn.replace(/^arn:[^:]*:s3:::/, '') : null
        if (name) links.push({ resource: 's3buckets', id: name, name, relation: 'replication target' })
      }
      // Event notification -> Lambda functions. A bucket may have several notification configs
      // pointing at the same function (one per event); dedupeLinks collapses them.
      const notif = await safe(() => clients.s3.send(new s3.GetBucketNotificationConfigurationCommand({ Bucket: id })))
      for (const cfg of notif?.LambdaFunctionConfigurations || []) {
        const arn = cfg.LambdaFunctionArn
        if (arn) links.push({ resource: 'lambdafunctions', id: arn, name: arn.split(':function:')[1] || arn, relation: 'notification' })
      }
      return dedupeLinks(links)
    },
  },
  {
    key: 'ec2instances',
    async list(clients) {
      const { ec2 } = await loadSdk()
      const rows = []
      let token
      do {
        const out = await clients.ec2.send(new ec2.DescribeInstancesCommand({ NextToken: token }))
        for (const r of out.Reservations || []) {
          for (const i of r.Instances || []) {
            const nameTag = (i.Tags || []).find(t => t.Key === 'Name')?.Value
            const state = i.State?.Name || 'unknown'
            rows.push({
              id: i.InstanceId, name: nameTag || i.InstanceId, region: REGION,
              state, status: ec2StatusLabel(state),
              type: i.InstanceType || '', az: i.Placement?.AvailabilityZone || '',
              privateIp: i.PrivateIpAddress || '', publicIp: i.PublicIpAddress || '',
              launchTime: i.LaunchTime ? i.LaunchTime.toISOString() : '',
              age: age(i.LaunchTime),
            })
          }
        }
        token = out.NextToken
      } while (token)
      return rows
    },
    // Inspect: the raw Instance object (much richer than the flattened list row).
    async describe(clients, id) {
      const { ec2 } = await loadSdk()
      const out = await clients.ec2.send(new ec2.DescribeInstancesCommand({ InstanceIds: [id] }))
      const inst = (out.Reservations || []).flatMap(r => r.Instances || [])[0]
      if (!inst) throw new Error(`Instance ${id} not found`)
      return inst
    },
    // Related resources (phase 1): the typed edges the console's instance detail page exposes as
    // clickable links, restricted to targets mezzanine ALREADY broadcasts (so a jump is an in-memory
    // teleport). Each link is { resource, id, name, relation }; `id` matches the target row's id so
    // the store can resolve it. EIP is the one edge NOT on the Instance object (the embedded
    // association shape carries no AllocationId), so it needs a DescribeAddresses by instance-id.
    async related(clients, id) {
      const { ec2 } = await loadSdk()
      const out = await clients.ec2.send(new ec2.DescribeInstancesCommand({ InstanceIds: [id] }))
      const inst = (out.Reservations || []).flatMap(r => r.Instances || [])[0]
      if (!inst) return []
      const links = []
      // Security groups: instance-level + per-ENI, deduped by GroupId (row id = GroupId).
      const sgs = new Map()
      for (const g of inst.SecurityGroups || []) if (g.GroupId) sgs.set(g.GroupId, g.GroupName || g.GroupId)
      for (const ni of inst.NetworkInterfaces || []) for (const g of ni.Groups || []) if (g.GroupId) sgs.set(g.GroupId, g.GroupName || g.GroupId)
      for (const [gid, gname] of sgs) links.push({ resource: 'securitygroups', id: gid, name: gname, relation: 'security group' })
      // VPC (row id = VpcId).
      if (inst.VpcId) links.push({ resource: 'vpcs', id: inst.VpcId, name: inst.VpcId, relation: 'vpc' })
      // EBS volumes from block device mappings (row id = VolumeId).
      for (const bdm of inst.BlockDeviceMappings || []) {
        const vid = bdm.Ebs?.VolumeId
        if (vid) links.push({ resource: 'ebsvolumes', id: vid, name: vid, relation: bdm.DeviceName ? `volume (${bdm.DeviceName})` : 'volume' })
      }
      // Elastic IPs - not readable off the instance object; query by instance-id (row id =
      // AllocationId || PublicIp). Optional permission, so swallow a failure.
      try {
        const addrs = await clients.ec2.send(new ec2.DescribeAddressesCommand({ Filters: [{ Name: 'instance-id', Values: [id] }] }))
        for (const a of addrs.Addresses || []) {
          const aid = a.AllocationId || a.PublicIp
          if (aid) links.push({ resource: 'elasticips', id: aid, name: a.PublicIp || aid, relation: 'elastic ip' })
        }
      } catch { /* ec2:DescribeAddresses optional */ }
      return dedupeLinks(links)
    },
  },
  // ── COMPUTE ──────────────────────────────────────────────
  {
    key: 'ebsvolumes',
    async list(clients) {
      const { ec2 } = await loadSdk()
      const rows = []
      let token
      do {
        const out = await clients.ec2.send(new ec2.DescribeVolumesCommand({ NextToken: token }))
        for (const v of out.Volumes || []) {
          const nameTag = (v.Tags || []).find(t => t.Key === 'Name')?.Value
          rows.push({
            id: v.VolumeId, name: nameTag || v.VolumeId, region: REGION,
            state: v.State || '', status: titleCase(v.State),
            size: `${v.Size ?? 0} GiB`, volType: v.VolumeType || '',
            az: v.AvailabilityZone || '', attachedTo: (v.Attachments || [])[0]?.InstanceId || '',
            age: age(v.CreateTime),
          })
        }
        token = out.NextToken
      } while (token)
      return rows
    },
    async describe(clients, id) {
      const { ec2 } = await loadSdk()
      const out = await clients.ec2.send(new ec2.DescribeVolumesCommand({ VolumeIds: [id] }))
      const vol = (out.Volumes || [])[0]
      if (!vol) throw new Error(`Volume ${id} not found`)
      return vol
    },
  },
  {
    key: 'lambdafunctions',
    async list(clients) {
      const { lambda } = await loadSdk()
      const rows = []
      let marker
      do {
        const out = await clients.lambda.send(new lambda.ListFunctionsCommand({ Marker: marker, MaxItems: 50 }))
        for (const f of out.Functions || []) {
          rows.push({
            id: f.FunctionArn || f.FunctionName, name: f.FunctionName, region: REGION,
            runtime: f.Runtime || (f.PackageType === 'Image' ? 'image' : ''),
            memory: `${f.MemorySize ?? 0} MB`, timeout: `${f.Timeout ?? 0}s`,
            handler: f.Handler || '', state: f.State || 'Active', status: f.State || 'Active',
            age: age(f.LastModified),
          })
        }
        marker = out.NextMarker
      } while (marker)
      return rows
    },
    // Inspect: GetFunction returns Configuration + Code + Tags (a map). Flatten the configuration
    // to the top so the JSON reads naturally; Tags stays a map (tagsToMap handles both shapes).
    async describe(clients, id) {
      const { lambda } = await loadSdk()
      const out = await clients.lambda.send(new lambda.GetFunctionCommand({ FunctionName: id }))
      return { ...(out.Configuration || {}), Code: out.Code, Concurrency: out.Concurrency, Tags: out.Tags }
    },
  },
  // ── NETWORK ──────────────────────────────────────────────
  {
    key: 'vpcs',
    async list(clients) {
      const { ec2 } = await loadSdk()
      const rows = []
      let token
      do {
        const out = await clients.ec2.send(new ec2.DescribeVpcsCommand({ NextToken: token }))
        for (const v of out.Vpcs || []) {
          const nameTag = (v.Tags || []).find(t => t.Key === 'Name')?.Value
          rows.push({
            id: v.VpcId, name: nameTag || v.VpcId, region: REGION,
            vpcId: v.VpcId, cidr: v.CidrBlock || '', state: v.State || '',
            status: titleCase(v.State), isDefault: v.IsDefault ? 'default' : '',
            tenancy: v.InstanceTenancy || '',
          })
        }
        token = out.NextToken
      } while (token)
      return rows
    },
    async describe(clients, id) {
      const { ec2 } = await loadSdk()
      const out = await clients.ec2.send(new ec2.DescribeVpcsCommand({ VpcIds: [id] }))
      const vpc = (out.Vpcs || [])[0]
      if (!vpc) throw new Error(`VPC ${id} not found`)
      return vpc
    },
  },
  {
    key: 'securitygroups',
    async list(clients) {
      const { ec2 } = await loadSdk()
      const rows = []
      let token
      do {
        const out = await clients.ec2.send(new ec2.DescribeSecurityGroupsCommand({ NextToken: token }))
        for (const g of out.SecurityGroups || []) {
          const nameTag = (g.Tags || []).find(t => t.Key === 'Name')?.Value
          rows.push({
            id: g.GroupId, name: nameTag || g.GroupName || g.GroupId, region: REGION,
            groupId: g.GroupId, vpcId: g.VpcId || '',
            inbound: (g.IpPermissions || []).length, outbound: (g.IpPermissionsEgress || []).length,
            description: g.Description || '', status: 'Active',
          })
        }
        token = out.NextToken
      } while (token)
      return rows
    },
    // Inspect: the full group, including the inbound/outbound rule sets (IpPermissions) the
    // list row only counts - the most useful detail for a security group.
    async describe(clients, id) {
      const { ec2 } = await loadSdk()
      const out = await clients.ec2.send(new ec2.DescribeSecurityGroupsCommand({ GroupIds: [id] }))
      const sg = (out.SecurityGroups || [])[0]
      if (!sg) throw new Error(`Security group ${id} not found`)
      return sg
    },
  },
  {
    key: 'elasticips',
    async list(clients) {
      const { ec2 } = await loadSdk()
      // DescribeAddresses is not paginated - it returns every allocation in one call.
      const out = await clients.ec2.send(new ec2.DescribeAddressesCommand({}))
      return (out.Addresses || []).map(a => {
        const nameTag = (a.Tags || []).find(t => t.Key === 'Name')?.Value
        const assoc = a.InstanceId || a.NetworkInterfaceId || ''
        return {
          id: a.AllocationId || a.PublicIp, name: nameTag || a.PublicIp, region: REGION,
          publicIp: a.PublicIp || '', allocationId: a.AllocationId || '',
          associatedTo: assoc, privateIp: a.PrivateIpAddress || '', scope: a.Domain || '',
          status: assoc ? 'Associated' : 'Unassociated',
        }
      })
    },
    // Inspect: re-query the single address. VPC EIPs are keyed by AllocationId; classic EIPs
    // (no allocation id) by PublicIp - the row id reflects whichever it is.
    async describe(clients, id) {
      const { ec2 } = await loadSdk()
      const filter = id.startsWith('eipalloc-') ? { AllocationIds: [id] } : { PublicIps: [id] }
      const out = await clients.ec2.send(new ec2.DescribeAddressesCommand(filter))
      const eip = (out.Addresses || [])[0]
      if (!eip) throw new Error(`Elastic IP ${id} not found`)
      return eip
    },
  },
]

// Normalize an EC2 state to a capitalized status label so it resolves through the theme status map
// (Running->ok, Stopped/Pending/Stopping/ShuttingDown->warn, Terminated->danger).
function ec2StatusLabel(state) {
  switch (state) {
    case 'running':       return 'Running'
    case 'pending':       return 'Pending'
    case 'stopping':      return 'Stopping'
    case 'stopped':       return 'Stopped'
    case 'shutting-down': return 'ShuttingDown'
    case 'terminated':    return 'Terminated'
    default: return state ? state[0].toUpperCase() + state.slice(1) : 'Unknown'
  }
}

// Collapse duplicate related-resource links (same resource + id), keeping the first relation seen.
// AWS can emit the same edge twice - e.g. a Lambda referenced by several S3 notification events, or
// a security group attached both at the instance level and on an ENI.
function dedupeLinks(links) {
  const seen = new Set()
  const out = []
  for (const l of links) {
    const k = `${l.resource}:${l.id}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(l)
  }
  return out
}

// Title-case a hyphenated AWS state ('in-use' -> 'In-use', 'available' -> 'Available') so it
// resolves through the shared statusColor map.
function titleCase(s) {
  if (!s) return ''
  return s.split('-').map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join('-')
}

// Top-level fetch folded into the server's data stream (peer of k8s fetchResources). Each service
// lists independently via Promise.allSettled so one failing IAM permission doesn't blank the rest.
export async function fetchAwsResources() {
  const clients = await getClients()
  if (!clients) {
    if (DEMO) return { ...getMockAwsResources(), awsConnected: false, awsDemo: true, awsRegion: REGION, awsIdentity: 'arn:aws:iam::123456789012:user/demo', awsError: null }
    return emptyAwsResources(lastError)
  }
  const out = { awsConnected: true, awsDemo: false, awsRegion: REGION, awsIdentity: identity?.Arn || null, awsError: null }
  const settled = await Promise.allSettled(SERVICES.map(s => s.list(clients)))
  SERVICES.forEach((s, i) => {
    const r = settled[i]
    out[s.key] = r.status === 'fulfilled' ? r.value : []
    if (r.status === 'rejected') {
      console.warn(`AWS ${s.key} list failed:`, r.reason?.message)
      out.awsError = out.awsError || r.reason?.message
    }
  })
  return out
}

// ── Inspect a single resource (module #2) ─────────────────────────────────────
// The AWS-native analog of k8s describe/yaml: returns the resource's full detail as JSON (the
// "yaml" analog - AWS is JSON-native so there is no yaml view), a curated DESCRIBE text, and the
// resource's TAGS as a first-class map (tags are AWS's universal organizing dimension). READ-only:
// no edit, no secret decode (see handoff-aws-inspect.md). Dispatches to the per-service describe()
// on the SERVICES registry, falling back to the already-listed row when a service defines none.
// 3-tier fallback like every other AWS helper: live -> mock (MEZZ_AWS_DEMO) -> error.
export async function fetchAwsDescribe(service, region, id) {
  const svc = SERVICES.find(s => s.key === service)
  if (!svc) return { error: `Unknown AWS service: ${service}` }
  let detail
  const clients = await getClients()
  if (!clients) {
    if (!DEMO) return { error: lastError || 'No AWS connection.' }
    detail = getMockAwsDescribe(service, id)
  } else {
    try {
      detail = svc.describe
        ? await svc.describe(clients, id, region || REGION)
        : (await svc.list(clients)).find(r => r.id === id) || { id }
    } catch (err) { return { error: err.message } }
  }
  if (!detail) return { error: `${service} ${id} not found` }
  const tags = tagsToMap(detail.Tags)
  let json
  try { json = JSON.stringify(detail, null, 2) } catch { json = String(detail) }
  return { json, tags, describe: formatAwsDescribe(detail, tags) }
}

// ── Related resources (phase 1) ───────────────────────────────────────────────
// The AWS-native analog of k8s jumpToOwner, but typed and multi-edge: returns the connected
// resources the console's detail page would link to, restricted to types mezzanine broadcasts.
// Dispatches to the per-service related() on the SERVICES registry; a service with none returns [].
// 3-tier fallback like every other AWS helper: live -> mock (MEZZ_AWS_DEMO) -> empty.
export async function fetchAwsRelated(service, region, id) {
  const svc = SERVICES.find(s => s.key === service)
  if (!svc || !svc.related) return { links: [] }
  const clients = await getClients()
  if (!clients) {
    if (!DEMO) return { links: [], error: lastError || 'No AWS connection.' }
    return { links: getMockAwsRelated(service, id) }
  }
  try {
    return { links: await svc.related(clients, id, region || REGION) }
  } catch (err) {
    return { links: [], error: err.message }
  }
}

// Normalize AWS's two tag shapes into a flat { key: value } map: the EC2-family `[{Key,Value}]`
// array and Lambda's already-flat object map both collapse here.
function tagsToMap(tags) {
  if (!tags) return {}
  if (Array.isArray(tags)) {
    const m = {}
    for (const t of tags) if (t && t.Key != null) m[t.Key] = t.Value ?? ''
    return m
  }
  if (typeof tags === 'object') return { ...tags }
  return {}
}

// Render a detail object as a kubectl-describe-style indented summary. Generic (works for any
// service's shape) so "add inspect for a service" stays one describe() function - no per-service
// formatter. Tags are rendered separately (the modal has a dedicated TAGS view) and omitted here.
function formatAwsDescribe(detail, tags) {
  const lines = []
  const scalar = (v) => {
    if (v == null) return ''
    if (v instanceof Date) return v.toISOString()
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }
  const walk = (obj, indent) => {
    const pad = '  '.repeat(indent)
    for (const [k, v] of Object.entries(obj)) {
      if (indent === 0 && k === 'Tags') continue          // rendered as its own section below
      if (v == null || v === '') continue
      if (Array.isArray(v)) {
        if (v.length === 0) continue
        if (v.every(x => x === null || typeof x !== 'object')) {
          lines.push(`${pad}${k}: ${v.join(', ')}`)
        } else {
          lines.push(`${pad}${k}:`)
          v.slice(0, 50).forEach(x => {
            if (x && typeof x === 'object' && !(x instanceof Date)) {
              const entries = Object.entries(x).filter(([, vv]) => vv != null && vv !== '')
              if (!entries.length) return
              lines.push(`${pad}  - ${entries[0][0]}: ${scalar(entries[0][1])}`)
              entries.slice(1).forEach(([ek, ev]) => lines.push(`${pad}    ${ek}: ${scalar(ev)}`))
            } else {
              lines.push(`${pad}  - ${scalar(x)}`)
            }
          })
          if (v.length > 50) lines.push(`${pad}  … ${v.length - 50} more`)
        }
      } else if (v instanceof Date) {
        lines.push(`${pad}${k}: ${v.toISOString()}`)
      } else if (typeof v === 'object') {
        if (Object.keys(v).length === 0) continue
        lines.push(`${pad}${k}:`)
        walk(v, indent + 1)
      } else {
        lines.push(`${pad}${k}: ${v}`)
      }
    }
  }
  walk(detail, 0)
  const tagKeys = Object.keys(tags || {})
  if (tagKeys.length) {
    lines.push('Tags:')
    tagKeys.sort().forEach(k => lines.push(`  ${k}: ${tags[k]}`))
  }
  return lines.join('\n')
}

// ── Lazy drilldown: a bucket's objects ───────────────────────────────────────
// S3 objects are NOT embedded in the bucket row (unlike pod.containers), so the drill is async and
// paginated - a key friction point vs the k8s synchronous-drill model (see modules.md).
export async function fetchS3Objects(bucket) {
  const clients = await getClients()
  if (!clients) return DEMO ? getMockS3Objects(bucket) : []
  const { s3 } = await loadSdk()
  const rows = []
  let token
  try {
    do {
      const out = await clients.s3.send(new s3.ListObjectsV2Command({
        Bucket: bucket, ContinuationToken: token, MaxKeys: 1000,
      }))
      for (const o of out.Contents || []) rows.push(s3ObjectRow(bucket, o))
      token = (out.IsTruncated && rows.length < MAX_OBJECTS) ? out.NextContinuationToken : undefined
    } while (token)
  } catch (err) {
    console.warn(`S3 list objects failed (${bucket}):`, err.message)
  }
  return rows
}

function s3ObjectRow(bucket, o) {
  return {
    id: `${bucket}/${o.Key}`, name: o.Key, bucket,
    size: humanSize(o.Size), sizeBytes: o.Size ?? 0,
    storageClass: o.StorageClass || 'STANDARD',
    modified: o.LastModified ? o.LastModified.toISOString() : '',
    age: age(o.LastModified), status: 'Active',
  }
}

// ── Write ops ─────────────────────────────────────────────────────────────────
// These replace kubectl exec/cp/delete entirely (friction: AWS has no exec/cp primitive). Reads
// work in demo; writes refuse in demo, matching the k8s posture (describe works, edit/delete don't).

// EC2 state transitions. Fire-and-forget like kubectl delete - the next refresh reflects the new
// state (pending -> running). region is carried because /:resource/:namespace/:name can't address it.
export async function ec2Action(op, region, ids) {
  const clients = await getClients()
  if (!clients) return { ok: false, error: DEMO ? 'EC2 actions are not available in demo mode.' : 'No AWS connection.' }
  const { ec2 } = await loadSdk()
  const client = (region && region !== REGION) ? new ec2.EC2Client({ region }) : clients.ec2
  const InstanceIds = Array.isArray(ids) ? ids : [ids]
  const make = {
    start:     () => new ec2.StartInstancesCommand({ InstanceIds }),
    stop:      () => new ec2.StopInstancesCommand({ InstanceIds }),
    reboot:    () => new ec2.RebootInstancesCommand({ InstanceIds }),
    terminate: () => new ec2.TerminateInstancesCommand({ InstanceIds }),
  }[op]
  if (!make) return { ok: false, error: `Unknown EC2 op: ${op}` }
  try { await client.send(make()); return { ok: true } }
  catch (err) { return { ok: false, error: err.message } }
}

// S3 object DOWNLOAD. Returns { body, contentType, contentLength } where body is a Node Readable
// (live) or a Buffer (mock). The "local" side is the browser, exactly like the kubectl-cp CopyModal.
export async function s3GetObject(bucket, key) {
  const clients = await getClients()
  if (!clients) return DEMO ? getMockS3Object(bucket, key) : null
  const { s3 } = await loadSdk()
  const out = await clients.s3.send(new s3.GetObjectCommand({ Bucket: bucket, Key: key }))
  return { body: out.Body, contentType: out.ContentType || 'application/octet-stream', contentLength: out.ContentLength }
}

// S3 object UPLOAD (raw bytes from the browser).
export async function s3PutObject(bucket, key, body) {
  const clients = await getClients()
  if (!clients) return { ok: false, error: DEMO ? 'Upload is not available in demo mode.' : 'No AWS connection.' }
  const { s3 } = await loadSdk()
  try {
    await clients.s3.send(new s3.PutObjectCommand({ Bucket: bucket, Key: key, Body: body }))
    return { ok: true, path: `${bucket}/${key}` }
  } catch (err) { return { ok: false, error: err.message } }
}

// ── small local formatters (kept here so aws.js has no dep on k8s.js internals) ──
function age(d) {
  if (!d) return ''
  const t = (d instanceof Date ? d : new Date(d)).getTime()
  if (!Number.isFinite(t)) return ''
  const secs = Math.floor((Date.now() - t) / 1000)
  if (secs < 0) return '0s'
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60); if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60);  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function humanSize(n) {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let v = n / 1024, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}

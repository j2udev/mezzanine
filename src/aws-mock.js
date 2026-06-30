// Demo data for the AWS provider - the twin of src/mock.js. Lets the whole AWS module build, run,
// and be Playwright-tested with ZERO AWS credentials (MEZZ_AWS_DEMO=1), exactly like MEZZ_DEMO for
// k8s. Rows are fully-normalized table shapes (the same contract fetchAwsResources emits), NOT raw
// SDK responses - each carries a synthetic `status` so ResourceRow's statusColor(item.status) works.

export function getMockAwsResources() {
  return {
    s3buckets: [
      { id: 'mezza9-prod-assets',     name: 'mezza9-prod-assets',     region: 'us-east-1', created: '2024-03-12T00:00:00Z', age: '1y',  objects: '12,304', size: '48.2 GiB', status: 'Active' },
      { id: 'mezza9-terraform-state', name: 'mezza9-terraform-state', region: 'us-east-1', created: '2023-11-02T00:00:00Z', age: '1y',  objects: '418',    size: '92.0 MiB', status: 'Active' },
      { id: 'mezza9-backups',         name: 'mezza9-backups',         region: 'us-west-2', created: '2024-06-20T00:00:00Z', age: '1y',  objects: '6,902',  size: '2.1 TiB',  status: 'Active' },
      { id: 'mezza9-cloudtrail-logs', name: 'mezza9-cloudtrail-logs', region: 'us-east-1', created: '2023-08-15T00:00:00Z', age: '1y',  objects: '88,210', size: '310 GiB',  status: 'Active' },
      { id: 'mezza9-static-site',     name: 'mezza9-static-site',     region: 'eu-west-1', created: '2025-01-09T00:00:00Z', age: '5mo', objects: '241',    size: '38.4 MiB', status: 'Active' },
      { id: 'mezza9-user-uploads',    name: 'mezza9-user-uploads',    region: 'us-east-1', created: '2025-03-28T00:00:00Z', age: '3mo', objects: '53,118', size: '184 GiB',  status: 'Active' },
    ],
    ec2instances: [
      { id: 'i-0a1b2c3d4e5f6a7b8', name: 'web-1',          region: 'us-east-1', state: 'running',       status: 'Running',      type: 't3.medium',  az: 'us-east-1a', privateIp: '10.0.1.21',  publicIp: '54.226.10.11', launchTime: '2025-05-24T00:00:00Z', age: '34d'  },
      { id: 'i-0b2c3d4e5f6a7b8c9', name: 'web-2',          region: 'us-east-1', state: 'running',       status: 'Running',      type: 't3.medium',  az: 'us-east-1b', privateIp: '10.0.2.22',  publicIp: '54.226.10.12', launchTime: '2025-05-24T00:00:00Z', age: '34d'  },
      { id: 'i-0c3d4e5f6a7b8c9d0', name: 'api-1',          region: 'us-east-1', state: 'running',       status: 'Running',      type: 'c6i.large',  az: 'us-east-1a', privateIp: '10.0.1.40',  publicIp: '',             launchTime: '2025-04-30T00:00:00Z', age: '58d'  },
      { id: 'i-0d4e5f6a7b8c9d0e1', name: 'batch-runner',   region: 'us-east-1', state: 'stopped',       status: 'Stopped',      type: 'm6i.xlarge', az: 'us-east-1c', privateIp: '10.0.3.61',  publicIp: '',             launchTime: '2025-02-11T00:00:00Z', age: '4mo'  },
      { id: 'i-0e5f6a7b8c9d0e1f2', name: 'jenkins',        region: 'us-east-1', state: 'running',       status: 'Running',      type: 't3.large',   az: 'us-east-1b', privateIp: '10.0.2.70',  publicIp: '3.88.140.7',   launchTime: '2024-12-01T00:00:00Z', age: '6mo'  },
      { id: 'i-0f6a7b8c9d0e1f203', name: 'bastion',        region: 'us-east-1', state: 'running',       status: 'Running',      type: 't3.micro',   az: 'us-east-1a', privateIp: '10.0.0.10',  publicIp: '52.4.200.91',  launchTime: '2024-09-18T00:00:00Z', age: '9mo'  },
      { id: 'i-0a7b8c9d0e1f20304', name: 'gpu-trainer',    region: 'us-west-2', state: 'pending',       status: 'Pending',      type: 'g5.xlarge',  az: 'us-west-2a', privateIp: '10.1.4.88',  publicIp: '',             launchTime: '2026-06-27T00:00:00Z', age: '2m'   },
      { id: 'i-0b8c9d0e1f2030405', name: 'legacy-monolith',region: 'eu-west-1', state: 'stopping',      status: 'Stopping',     type: 'm5.2xlarge', az: 'eu-west-1a', privateIp: '10.2.3.99',  publicIp: '',             launchTime: '2023-07-04T00:00:00Z', age: '2y'   },
      { id: 'i-0c9d0e1f203040506', name: 'spot-worker-old',region: 'us-east-1', state: 'terminated',    status: 'Terminated',   type: 'c6i.large',  az: 'us-east-1b', privateIp: '',           publicIp: '',             launchTime: '2025-06-01T00:00:00Z', age: '26d'  },
    ],
    ebsvolumes: [
      { id: 'vol-0a1b2c3d4e5f60001', name: 'web-1-root',    region: 'us-east-1', state: 'in-use',    status: 'In-use',    size: '30 GiB',  volType: 'gp3',  az: 'us-east-1a', attachedTo: 'i-0a1b2c3d4e5f6a7b8', age: '34d' },
      { id: 'vol-0a1b2c3d4e5f60002', name: 'web-2-root',    region: 'us-east-1', state: 'in-use',    status: 'In-use',    size: '30 GiB',  volType: 'gp3',  az: 'us-east-1b', attachedTo: 'i-0b2c3d4e5f6a7b8c9', age: '34d' },
      { id: 'vol-0a1b2c3d4e5f60003', name: 'jenkins-data',  region: 'us-east-1', state: 'in-use',    status: 'In-use',    size: '500 GiB', volType: 'io2',  az: 'us-east-1b', attachedTo: 'i-0e5f6a7b8c9d0e1f2', age: '6mo' },
      { id: 'vol-0a1b2c3d4e5f60004', name: 'old-backup',    region: 'us-east-1', state: 'available', status: 'Available', size: '100 GiB', volType: 'gp2',  az: 'us-east-1c', attachedTo: '',                    age: '4mo' },
      { id: 'vol-0a1b2c3d4e5f60005', name: 'scratch',       region: 'us-east-1', state: 'available', status: 'Available', size: '20 GiB',  volType: 'gp3',  az: 'us-east-1a', attachedTo: '',                    age: '12d' },
      { id: 'vol-0a1b2c3d4e5f60006', name: 'db-snapshot-restore', region: 'us-east-1', state: 'creating', status: 'Creating', size: '1024 GiB', volType: 'io2', az: 'us-east-1c', attachedTo: '',          age: '1m'  },
    ],
    lambdafunctions: [
      { id: 'fn:image-thumbnailer',  name: 'image-thumbnailer',  region: 'us-east-1', runtime: 'python3.12', memory: '512 MB',  timeout: '30s',  handler: 'app.handler',    state: 'Active',   status: 'Active',   age: '12d' },
      { id: 'fn:api-authorizer',     name: 'api-authorizer',     region: 'us-east-1', runtime: 'nodejs20.x', memory: '256 MB',  timeout: '10s',  handler: 'index.handler',  state: 'Active',   status: 'Active',   age: '3mo' },
      { id: 'fn:nightly-report',     name: 'nightly-report',     region: 'us-east-1', runtime: 'python3.11', memory: '1024 MB', timeout: '300s', handler: 'report.run',     state: 'Active',   status: 'Active',   age: '8mo' },
      { id: 'fn:slack-notifier',     name: 'slack-notifier',     region: 'us-east-1', runtime: 'nodejs20.x', memory: '128 MB',  timeout: '15s',  handler: 'notify.send',    state: 'Active',   status: 'Active',   age: '1y'  },
      { id: 'fn:ml-inference',       name: 'ml-inference',       region: 'us-east-1', runtime: 'image',      memory: '3008 MB', timeout: '120s', handler: '',               state: 'Pending',  status: 'Pending',  age: '4m'  },
    ],
    vpcs: [
      { id: 'vpc-0a1b2c3d4e5f60001', name: 'default',     region: 'us-east-1', vpcId: 'vpc-0a1b2c3d4e5f60001', cidr: '172.31.0.0/16', state: 'available', status: 'Available', isDefault: 'default', tenancy: 'default' },
      { id: 'vpc-0a1b2c3d4e5f60002', name: 'prod-vpc',    region: 'us-east-1', vpcId: 'vpc-0a1b2c3d4e5f60002', cidr: '10.0.0.0/16',   state: 'available', status: 'Available', isDefault: '',        tenancy: 'default' },
      { id: 'vpc-0a1b2c3d4e5f60003', name: 'staging-vpc', region: 'us-east-1', vpcId: 'vpc-0a1b2c3d4e5f60003', cidr: '10.20.0.0/16',  state: 'available', status: 'Available', isDefault: '',        tenancy: 'default' },
    ],
    securitygroups: [
      { id: 'sg-0a1b2c3d4e5f60001', name: 'default',        region: 'us-east-1', groupId: 'sg-0a1b2c3d4e5f60001', vpcId: 'vpc-0a1b2c3d4e5f60002', inbound: 1, outbound: 1, description: 'default VPC security group',     status: 'Active' },
      { id: 'sg-0a1b2c3d4e5f60002', name: 'web-sg',         region: 'us-east-1', groupId: 'sg-0a1b2c3d4e5f60002', vpcId: 'vpc-0a1b2c3d4e5f60002', inbound: 3, outbound: 1, description: 'http/https from anywhere',        status: 'Active' },
      { id: 'sg-0a1b2c3d4e5f60003', name: 'db-sg',          region: 'us-east-1', groupId: 'sg-0a1b2c3d4e5f60003', vpcId: 'vpc-0a1b2c3d4e5f60002', inbound: 2, outbound: 1, description: 'postgres from app tier',          status: 'Active' },
      { id: 'sg-0a1b2c3d4e5f60004', name: 'bastion-sg',     region: 'us-east-1', groupId: 'sg-0a1b2c3d4e5f60004', vpcId: 'vpc-0a1b2c3d4e5f60002', inbound: 1, outbound: 1, description: 'ssh from office CIDR',            status: 'Active' },
      { id: 'sg-0a1b2c3d4e5f60005', name: 'lambda-sg',      region: 'us-east-1', groupId: 'sg-0a1b2c3d4e5f60005', vpcId: 'vpc-0a1b2c3d4e5f60002', inbound: 0, outbound: 1, description: 'egress-only for VPC lambdas',      status: 'Active' },
    ],
    elasticips: [
      { id: 'eipalloc-0a1b2c3d4e5f001', name: 'bastion-eip', region: 'us-east-1', publicIp: '52.4.200.91',   allocationId: 'eipalloc-0a1b2c3d4e5f001', associatedTo: 'i-0f6a7b8c9d0e1f203', privateIp: '10.0.0.10', scope: 'vpc', status: 'Associated'   },
      { id: 'eipalloc-0a1b2c3d4e5f002', name: 'nat-eip',     region: 'us-east-1', publicIp: '3.224.18.40',   allocationId: 'eipalloc-0a1b2c3d4e5f002', associatedTo: 'eni-0aa11bb22cc33dd44', privateIp: '10.0.0.5',  scope: 'vpc', status: 'Associated'   },
      { id: 'eipalloc-0a1b2c3d4e5f003', name: 'jenkins-eip', region: 'us-east-1', publicIp: '3.88.140.7',    allocationId: 'eipalloc-0a1b2c3d4e5f003', associatedTo: 'i-0e5f6a7b8c9d0e1f2', privateIp: '10.0.2.70', scope: 'vpc', status: 'Associated'   },
      { id: 'eipalloc-0a1b2c3d4e5f004', name: 'orphan-eip',  region: 'us-east-1', publicIp: '54.91.33.250',  allocationId: 'eipalloc-0a1b2c3d4e5f004', associatedTo: '',                     privateIp: '',          scope: 'vpc', status: 'Unassociated' },
    ],
  }
}

// Lazy drill: a bucket's objects. Keyed by bucket so each looks distinct in the demo.
export function getMockS3Objects(bucket) {
  const common = (prefix, n, ext, sc = 'STANDARD') =>
    Array.from({ length: n }, (_, i) => {
      const key = `${prefix}/part-${String(i).padStart(4, '0')}.${ext}`
      return {
        id: `${bucket}/${key}`, name: key, bucket,
        size: `${(2 + (i % 7) * 1.3).toFixed(1)} MiB`, sizeBytes: (2 + (i % 7) * 1.3) * 1024 * 1024,
        storageClass: sc, modified: '2025-06-10T00:00:00Z', age: `${10 + i}d`, status: 'Active',
      }
    })
  const byBucket = {
    'mezza9-prod-assets':     [...mkObj(bucket, 'index.html', 4_213, 'STANDARD', '3mo'), ...common('assets/img', 6, 'png'), ...common('assets/js', 4, 'js')],
    'mezza9-terraform-state': mkObj(bucket, 'env/prod/terraform.tfstate', 1_048_576, 'STANDARD', '2d').concat(mkObj(bucket, 'env/staging/terraform.tfstate', 524_288, 'STANDARD', '6d')),
    'mezza9-backups':         common('db/postgres', 8, 'sql.gz', 'GLACIER'),
    'mezza9-cloudtrail-logs': common('AWSLogs/123456789012/CloudTrail/us-east-1', 10, 'json.gz', 'STANDARD_IA'),
    'mezza9-static-site':     [...mkObj(bucket, 'index.html', 8_120, 'STANDARD', '5mo'), ...mkObj(bucket, 'styles.css', 14_700, 'STANDARD', '5mo'), ...common('img', 5, 'webp')],
    'mezza9-user-uploads':    common('u/42/photos', 7, 'jpg'),
  }
  return byBucket[bucket] || common('data', 5, 'bin')
}

function mkObj(bucket, key, bytes, sc, age) {
  return [{
    id: `${bucket}/${key}`, name: key, bucket,
    size: humanSize(bytes), sizeBytes: bytes, storageClass: sc,
    modified: '2025-06-10T00:00:00Z', age, status: 'Active',
  }]
}

// Inspect detail for one resource (module #2). Returns a believable raw-API-shaped object with a
// Tags field, so the AWS inspect modal (DESCRIBE / JSON / TAGS) is fully testable with zero
// credentials (MEZZ_AWS_DEMO=1). Looks the selected row up by id in the demo list, then expands it
// into the richer shape the live Describe*/Get* calls would return. Tags follow the live shape per
// service: an array of {Key,Value} for the EC2 family + S3, a flat map for Lambda.
export function getMockAwsDescribe(service, id) {
  const rows = getMockAwsResources()[service] || []
  const row = rows.find(r => r.id === id) || rows[0] || { id, name: id }
  const nameTags = (extra = {}) => [{ Key: 'Name', Value: row.name }, { Key: 'env', Value: 'prod' }, { Key: 'managed-by', Value: 'mezza9' }, ...Object.entries(extra).map(([Key, Value]) => ({ Key, Value }))]
  const num = (s) => parseInt(String(s), 10) || 0
  switch (service) {
    case 'ec2instances': return {
      InstanceId: row.id, InstanceType: row.type, Architecture: 'x86_64',
      State: { Code: 16, Name: row.state }, ImageId: 'ami-0c7217cdde317cfec',
      Placement: { AvailabilityZone: row.az, Tenancy: 'default', GroupName: '' },
      PrivateIpAddress: row.privateIp || undefined, PublicIpAddress: row.publicIp || undefined,
      PrivateDnsName: row.privateIp ? `ip-${row.privateIp.replace(/\./g, '-')}.ec2.internal` : undefined,
      SubnetId: 'subnet-0a1b2c3d4e5f60011', VpcId: 'vpc-0a1b2c3d4e5f60002',
      LaunchTime: row.launchTime, Monitoring: { State: 'disabled' },
      RootDeviceName: '/dev/xvda', RootDeviceType: 'ebs', EbsOptimized: false,
      SecurityGroups: [{ GroupId: 'sg-0a1b2c3d4e5f60002', GroupName: 'web-sg' }],
      IamInstanceProfile: { Arn: 'arn:aws:iam::123456789012:instance-profile/app', Id: 'AIPA0000EXAMPLE' },
      Tags: nameTags(),
    }
    case 'ebsvolumes': return {
      VolumeId: row.id, Size: num(row.size), VolumeType: row.volType, State: row.state,
      AvailabilityZone: row.az, Encrypted: true, KmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/abcd-1234',
      Iops: row.volType === 'io2' ? 10000 : 3000, Throughput: row.volType === 'gp3' ? 125 : undefined,
      SnapshotId: 'snap-0a1b2c3d4e5f6a7b8', CreateTime: '2025-05-24T00:00:00Z', MultiAttachEnabled: false,
      Attachments: row.attachedTo ? [{ InstanceId: row.attachedTo, Device: '/dev/xvda', State: 'attached', DeleteOnTermination: true }] : [],
      Tags: [{ Key: 'Name', Value: row.name }],
    }
    case 'lambdafunctions': return {
      FunctionName: row.name, FunctionArn: `arn:aws:lambda:${row.region}:123456789012:function:${row.name}`,
      Runtime: row.runtime === 'image' ? undefined : row.runtime, PackageType: row.runtime === 'image' ? 'Image' : 'Zip',
      Handler: row.handler || undefined, MemorySize: num(row.memory), Timeout: num(row.timeout),
      State: row.state, LastModified: '2025-06-10T00:00:00Z', CodeSize: 10485760,
      Role: 'arn:aws:iam::123456789012:role/lambda-exec', Architectures: ['x86_64'],
      TracingConfig: { Mode: 'PassThrough' }, Environment: { Variables: { LOG_LEVEL: 'info', STAGE: 'prod' } },
      Code: { RepositoryType: 'S3', Location: 'https://prod-iad-c1-lambda.s3.amazonaws.com/snapshots/...' },
      Tags: { Name: row.name, env: 'prod', 'managed-by': 'mezza9' },
    }
    case 'vpcs': return {
      VpcId: row.vpcId, CidrBlock: row.cidr, State: row.state, IsDefault: row.isDefault === 'default',
      InstanceTenancy: row.tenancy, DhcpOptionsId: 'dopt-0a1b2c3d4e5f60001',
      CidrBlockAssociationSet: [{ AssociationId: 'vpc-cidr-assoc-0a1b2c3d', CidrBlock: row.cidr, CidrBlockState: { State: 'associated' } }],
      Tags: row.name && row.name !== row.vpcId ? [{ Key: 'Name', Value: row.name }] : [],
    }
    case 'securitygroups': {
      const inbound = [
        { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'https' }] },
        { IpProtocol: 'tcp', FromPort: 80, ToPort: 80, IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'http' }] },
        { IpProtocol: 'tcp', FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: '10.0.0.0/8', Description: 'ssh internal' }] },
      ].slice(0, row.inbound || 0)
      return {
        GroupId: row.groupId, GroupName: row.name, Description: row.description, VpcId: row.vpcId,
        OwnerId: '123456789012', IpPermissions: inbound,
        IpPermissionsEgress: [{ IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'all egress' }] }],
        Tags: [{ Key: 'Name', Value: row.name }],
      }
    }
    case 'elasticips': return {
      PublicIp: row.publicIp, AllocationId: row.allocationId, Domain: row.scope,
      InstanceId: row.associatedTo && row.associatedTo.startsWith('i-') ? row.associatedTo : undefined,
      NetworkInterfaceId: row.associatedTo && row.associatedTo.startsWith('eni-') ? row.associatedTo : undefined,
      AssociationId: row.associatedTo ? 'eipassoc-0a1b2c3d4e5f60001' : undefined,
      PrivateIpAddress: row.privateIp || undefined, NetworkBorderGroup: row.region, PublicIpv4Pool: 'amazon',
      Tags: [{ Key: 'Name', Value: row.name }],
    }
    case 's3buckets': return {
      Name: row.id, LocationConstraint: row.region === 'us-east-1' ? '' : row.region, CreationDate: row.created,
      Versioning: { Status: 'Enabled', MFADelete: 'Disabled' },
      Encryption: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms', KMSMasterKeyID: 'arn:aws:kms:us-east-1:123456789012:key/abcd-1234' }, BucketKeyEnabled: true }] },
      PublicAccessBlock: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true },
      PolicyStatus: { IsPublic: false },
      Acl: { Owner: { DisplayName: 'mezza9', ID: 'abc123def456' }, Grants: [{ Grantee: { Type: 'CanonicalUser', DisplayName: 'mezza9', ID: 'abc123def456' }, Permission: 'FULL_CONTROL' }] },
      Tags: [{ Key: 'Name', Value: row.name }, { Key: 'env', Value: row.id.includes('prod') ? 'prod' : 'shared' }],
    }
    default: return { id, name: row.name, Tags: [] }
  }
}

// Related resources for the demo (phase 1) - the typed edges the RelatedModal shows. Derived from
// getMockAwsResources so every link resolves to a REAL demo row (the store guards on existence, so
// dangling links would just be dropped). EC2: its attached EBS volume(s) + EIP (reverse-matched by
// attachedTo/associatedTo), plus a representative SG and the prod VPC. S3: a notification Lambda for
// the upload-ish buckets, and a log-target bucket for everything pointing at the cloudtrail bucket.
export function getMockAwsRelated(service, id) {
  const all = getMockAwsResources()
  if (service === 'ec2instances') {
    const links = []
    links.push({ resource: 'securitygroups', id: 'sg-0a1b2c3d4e5f60002', name: 'web-sg', relation: 'security group' })
    links.push({ resource: 'vpcs', id: 'vpc-0a1b2c3d4e5f60002', name: 'prod-vpc', relation: 'vpc' })
    for (const v of all.ebsvolumes) if (v.attachedTo === id) links.push({ resource: 'ebsvolumes', id: v.id, name: v.name, relation: 'volume (/dev/xvda)' })
    for (const e of all.elasticips) if (e.associatedTo === id) links.push({ resource: 'elasticips', id: e.id, name: e.publicIp, relation: 'elastic ip' })
    return links
  }
  if (service === 's3buckets') {
    const links = []
    // The cloudtrail-logs bucket is the access-log sink for the other buckets.
    if (id !== 'mezza9-cloudtrail-logs') links.push({ resource: 's3buckets', id: 'mezza9-cloudtrail-logs', name: 'mezza9-cloudtrail-logs', relation: 'log target' })
    // Upload-ish buckets fire a thumbnailing Lambda on object-created.
    if (id === 'mezza9-user-uploads' || id === 'mezza9-prod-assets') links.push({ resource: 'lambdafunctions', id: 'fn:image-thumbnailer', name: 'image-thumbnailer', relation: 'notification' })
    return links
  }
  return []
}

// A single object's bytes, for the demo DOWNLOAD path (so Shift+C download works with no creds).
export function getMockS3Object(bucket, key) {
  const body = Buffer.from(
    `# mezza9 demo object\n# bucket: ${bucket}\n# key: ${key}\n\nThis is mock S3 object content served in demo mode (MEZZ_AWS_DEMO=1).\n`,
    'utf8',
  )
  return { body, contentType: 'text/plain; charset=utf-8', contentLength: body.length }
}

function humanSize(n) {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let v = n / 1024, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}

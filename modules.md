# Module friction log

mezza9 is becoming a **pluggable, multi-provider dashboard**: the same shell (sidebar, list,
command mode, inspect modal, action registry, theming) driven by interchangeable provider modules.
Kubernetes is the original. AWS (S3 + EC2, then more) is module #2.

**Strategy: build-then-extract.** We are deliberately NOT designing a clean cross-provider plugin
interface up front - with only k8s as a data point, any abstraction would just be "k8s, renamed."
Instead we cram AWS into the existing k8s-shaped shell, fork where it fights, and **record every
point of friction here.** This file is the derived (not guessed) spec for the eventual provider
interface. When the friction has been seen across several AWS services, we lift the shared shape up
a level to become the plugin contract.

Two layers of extensibility, treated differently:
- **Cross-provider** (k8s / aws / future docker, git, ...): DEFERRED. That's what this log informs.
- **Intra-AWS** (s3, ec2, then rds, lambda, iam, vpc, ...): designed NOW, because many AWS services
  are known to be coming. The AWS module owns an internal registry (`src/aws.js` `SERVICES` on the
  backend, `client/src/aws/resources.js` on the frontend) so adding a service is one entry, not a
  fork. This registry is itself a scoped first draft of the cross-provider interface.

## Decisions (with the user)

- **Provider is a DEPLOY-TIME config, not a UI switch.** `MEZZ_PROVIDER` (`k8s` default | `aws`)
  selects what this deployment is - a k8s dashboard OR an AWS dashboard. There is NO runtime
  switcher in the UI. The server polls only the configured provider (`refresh()` is gated on
  `PROVIDER`), surfaces it via `/api/health`, and the client boots straight into that provider's
  shell (`store.initProvider` from the health probe; sidebar, `:` picker, and resolution are all
  scoped to it). This is the truest realization of "plug in a module → it becomes a dashboard for
  that thing," and it partially resolves friction #2 (the inactive provider is never polled).
  - Earlier iteration was a runtime `activeProvider` switcher (sidebar chip + `:aws`/`:k8s`); the
    user redirected to config-on-deploy. `activeProvider` survives in the store but is set once at
    boot and never toggled.
- **Single region first**: one `AWS_REGION` (default us-east-1), no region picker. The absent region
  axis is the cleanest friction entry (see #1).
- **Separate `MEZZ_AWS_DEMO` gate** (not the k8s `MEZZ_DEMO`), so an AWS deployment can run on mock
  data with zero credentials, exactly like `MEZZ_DEMO` for k8s.

## Friction observed (the provider-boundary requirements)

1. **`namespace` is a load-bearing axis with no AWS analog.** `getFilteredItems`, `arrangeForDisplay`,
   the `:ns` picker, and `ResourceList`'s `allNamespaces` all hinged on a hardcoded `namespace` field.
   **RESOLVED (extracted - the first cross-provider extraction).** Introduced a provider-supplied
   SCOPE AXIS: `scopeFieldFor(provider)` returns `'namespace'` (k8s) or `'region'` (aws);
   `isGlobalScopedResource(r)` is the per-provider exemption (k8s cluster-scoped types; aws
   `AWS_GLOBAL_SCOPED`, e.g. future IAM). The active scope value still lives in `activeNamespace`
   ('all' = unscoped). Filtering, grouping, the flat scope column, the HUD chip, and the warp action
   all read the scope field generically - k8s behaviour is byte-identical (scopeField='namespace'),
   aws gains region filter + group-by-region + a flat REGION column + `:region <name>` + `w`
   warp-to-region. Verified visually on BOTH providers. Remaining: a region/account PICKER UI (today:
   grouped-header click + `:region`), and multi-region/multi-account FETCH (see #2 / #9).

2. **One global 5s poll of every type does not fit AWS.** k8s refetches all types cheaply over one
   kubeconfig; AWS calls cost money, rate-limit, and are per-region/per-service. We isolated AWS in
   its own timeout race (can't stall k8s) and gate it behind `AWS_ENABLED` so a pure-k8s
   devcontainer never hits STS. But the deeper mismatch stands. **Need:** per-provider refresh
   cadence + lazy/on-demand fetch (e.g. only list S3 objects when drilled in).

3. **Drill-down assumes children are EMBEDDED in the parent.** `getDrillTarget` is synchronous and
   reads in-memory data (`pod.containers`). S3 objects need a separate paginated `ListObjectsV2`, so
   we could NOT use `getDrillTarget` - we add an async `drillIntoBucket()` + an Enter special-case.
   **Need:** an async drill resolver as a first-class provider concept.

4. **`isStd()` is a kubectl denylist.** `actions.js` assumes everything not in a small exclude set is
   addressable as `/:resource/:namespace/:name` for describe/yaml/edit/delete. False for every AWS
   type. We extend the denylist again. **Need:** invert to an allowlist / per-resource capability
   tags. Relatedly the kubectl verbs don't map: an EC2 instance has no YAML, "delete" means
   "terminate" (distinct, irreversible), S3 buckets have no editable spec.

5. **The action registry couples `run` to kubectl-shaped endpoints/transports.** S3 cp is bucket/key
   blob get/put (no container, tar, or exec); EC2 start/stop/terminate are state transitions. We keep
   the Shift+C / keybinding philosophy but the implementations fully diverge. AWS has **no
   exec/port-forward primitive** at all (the equivalents are SSM / EC2 Instance Connect / SSH - a
   different transport + credential model), so this module ships no shell/port-forward. **Need:**
   per-provider action sets + a provider transport layer, not one global `OBJECT_ACTIONS` keyed only
   on a resource string.

6. **Rows assume a single `status` string.** `ResourceRow` calls `statusColor(item.status)`
   unconditionally; EC2 has `state`, S3 buckets have none. We cram by having the backend synthesize a
   `status` onto every AWS row (state->label for EC2, 'Active' for buckets/objects). **Need:**
   provider-supplied status extraction + a status->severity map.

7. **Connection/health state is singular.** `demoMode` / `clusterConnected` / `clusterError` are one
   bool/string and can't express "k8s live + AWS mock." We added a parallel
   `awsConnected`/`awsDemo`/`awsError`/`awsRegion`/`awsIdentity` and a separate demo gate. The
   NotConnected empty-state and demo-guarded routes are all written against one provider. **Need:**
   per-provider connection + demo state.

8. **Resource identity + route shape leak the k8s model.** k8s rows are keyed by uid and addressed by
   `namespace+name`. S3 buckets are global by name; EC2 instances are region+instance-id. `region`
   doesn't fit `/:resource/:namespace/:name`, so AWS needed bespoke routes
   (`/api/aws/ec2/:region/:id/:op`) and a `region` field smuggled onto each row. **Need:**
   provider-supplied addressing, not a fixed route template.

9. **Identity/permissions model has no analog.** RBAC whoami (SelfSubjectRulesReview) + `:ns` are
   deeply k8s. AWS identity is account+region via STS; permissions are IAM/bucket-policy/security
   groups. We hardcoded one `AWS_REGION` and shipped no IAM/whoami surface. **Need:** provider-supplied
   identity + a region/context selector (this is also where the future #94-part2 per-user auth lives).

## Backend shape delivered (module #2)

- `src/aws.js` - twin of `k8s.js`: lazy SDK import, default-cred-chain `getClients()` (STS-validated,
  5s race, cached), an internal `SERVICES` registry, `fetchAwsResources()`, async `fetchS3Objects()`
  drill, `ec2Action()` / `s3GetObject()` / `s3PutObject()` write+read ops. 3-tier fallback
  live->mock(`MEZZ_AWS_DEMO`)->empty.
- `src/aws-mock.js` - twin of `mock.js`: 6 buckets, 9 instances spanning every EC2 state, per-bucket
  objects, a demo object body. Whole module is testable with zero AWS credentials.
- `src/server.js` - AWS folded into the `latest` stream (atomic publish, isolated timeout); routes
  `GET /api/aws/s3/:bucket`, `GET|POST /api/aws/s3/:bucket/object?key=`,
  `POST /api/aws/ec2/:region/:id/:op`, and `GET /api/aws/describe/:service/:region/:id` (the
  inspect view). All inherit the `/api/*` auth gate.

## Inspect (the AWS analog of describe/yaml) - delivered

AWS resources are excluded from the k8s unified inspect modal (`isStd()` returns false: no
`kubectl describe/yaml/edit`). They get their own READ-only depth view instead - modal type
`aws-inspect` with a DESCRIBE / JSON / TAGS toggle (no yaml, no edit, no secret decode; AWS mutates
via specific Modify/Put calls, not apply-a-doc, and is JSON-native so there is no yaml). It reuses
ActionModal's polished read-view (ContentLines, search, line numbers) behind an additive
`isAwsInspect` branch rather than a parallel modal.

This touches two open friction points without resolving them: **#4** (the `isStd` denylist) - the
inspect is a SEPARATE registry entry (`when: AWS_RESOURCE_KEYS.has(r)`) precisely because AWS verbs
don't map onto the kubectl describe/yaml/edit/delete shape, reinforcing that `isStd` wants to invert
to per-resource capability tags; and **#8** (addressing) - `region + id` ride the path
(`/api/aws/describe/:service/:region/:id`) since AWS identity doesn't fit `/:resource/:namespace/:name`.

Intra-AWS, inspect stays one-entry-per-service: each `SERVICES` entry gained an optional
`describe(clients, id, region)` returning the rich raw SDK object; `fetchAwsDescribe()` dispatches to
it (falling back to the listed row), pulls tags out via `tagsToMap()` (both the `[{Key,Value}]` array
and Lambda's flat map), and renders a generic kubectl-describe-style summary via `formatAwsDescribe()`
so DESCRIBE is automatic for any future service.

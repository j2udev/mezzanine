import { FORWARDABLE, OWNED, CLUSTER_SCOPED_RESOURCES, RBAC_RESOURCES, scopeFieldFor, isGlobalScopedResource } from './store'
import { AWS_RESOURCE_KEYS } from './aws/resources'

// Warp the active-scope filter to the selected item's scope value (namespace for k8s, region for
// aws); toggles back to 'all' if already scoped there. Shared by the warp-ns / warp-region actions.
function warpToScope(s) {
  const item = s.getFilteredItems().find(i => i.id === s.selectedId)
  const v = item?.[scopeFieldFor(s.activeProvider)]
  if (v) s.setActiveNamespace(s.activeNamespace === v ? 'all' : v)
}

// ── Object action registry ────────────────────────────────────────────────────
// Single source of truth for every per-object action. To add a new action, add one
// entry here: it automatically appears in the detail panel, the actions palette (a),
// and (if it defines `key`) as a keyboard shortcut handled by useKeys. Nothing else
// needs to change - this is the pattern future object interactions conform to.
//
// Fields:
//   id     unique string
//   label  menu/button text
//   hint   key shown in the UI (display only)
//   color  accent color
//   group  palette section
//   danger destructive - kept out of the always-visible panel buttons
//   when   (resource) => bool : is this action applicable to the active resource?
//   key    (event)    => bool : does this keydown trigger the action? (optional)
//   run    (store)    => void : perform the action (store = useStore.getState())

// 'containers' = the synthetic pod-drilldown rows; `l` on one tails that single container (#80).
const LOGS = new Set(['pods', 'deployments', 'statefulsets', 'daemonsets', 'services', 'jobs', 'containers'])
// "Standard" resources that support describe/yaml/json/edit/delete. Native types AND custom
// resource instances (`cr:group/version/plural`) qualify - kubectl drives all of these the
// same way via kubectlResource() (task 21). Helm releases, the container drilldown rows, and
// the port-forward table are not kubectl objects, so they are excluded.
// AWS resources are not kubectl objects - they have no describe/yaml/edit/delete via the
// /:resource/:namespace/:name route, so they are excluded too. (friction #4 in modules.md: this
// denylist should really invert to an allowlist / per-resource capability tags.)
const isStd = (r) => r !== 'helmreleases' && r !== 'containers' && r !== 'portforwards' && !AWS_RESOURCE_KEYS.has(r)

export const OBJECT_ACTIONS = [
  // ── Inspect ──────────────────────────────────────────────
  { id: 'logs', label: 'Logs', hint: 'l', color: 'var(--mz-ok)', group: 'Inspect',
    when: r => LOGS.has(r), key: e => e.key === 'l', run: s => s.openModal('logs') },
  { id: 'describe', label: 'Describe', hint: 'd', color: 'var(--mz-alt)', group: 'Inspect',
    when: r => isStd(r) || r === 'helmreleases',
    key: e => e.key === 'd' && !e.ctrlKey && !e.metaKey, run: s => s.openModal('describe') },
  { id: 'yaml', label: 'YAML / JSON', hint: 'y', color: 'var(--mz-accent)', group: 'Inspect',
    when: r => isStd(r), key: e => e.key === 'y', run: s => s.openModal('yaml') },
  { id: 'edit', label: 'Edit', hint: 'e', color: 'var(--mz-orange)', group: 'Inspect',
    when: r => isStd(r), key: e => e.key === 'e', run: s => s.openModal('edit') },
  { id: 'decode', label: 'Decode secret', hint: 'x', color: 'var(--mz-orange)', group: 'Inspect',
    when: r => r === 'secrets', key: e => e.key === 'x', run: s => s.openSecretDecoded() },
  // RBAC policy / rules view (task 94) - "what can this resource do". Enter also opens it
  // (k9s muscle memory, wired in useKeys); `p` is the registry-dispatched alternate.
  { id: 'policy', label: 'Policy / Rules', hint: '↵', color: 'var(--mz-orange)', group: 'Inspect',
    when: r => RBAC_RESOURCES.has(r), key: e => e.key === 'p', run: s => s.openModal('policy') },

  // ── Helm ─────────────────────────────────────────────────
  { id: 'helm-values', label: 'Values', hint: 'v', color: 'var(--mz-ok)', group: 'Helm',
    when: r => r === 'helmreleases', key: e => e.key === 'v', run: s => s.openModal('helm-values') },
  { id: 'helm-manifest', label: 'Manifest', hint: 'm', color: 'var(--mz-alt)', group: 'Helm',
    when: r => r === 'helmreleases', key: e => e.key === 'm', run: s => s.openModal('helm-manifest') },
  { id: 'helm-notes', label: 'Notes', hint: 'n', color: 'var(--mz-orange)', group: 'Helm',
    when: r => r === 'helmreleases', key: e => e.key === 'n', run: s => s.openModal('helm-notes') },
  { id: 'helm-history', label: 'History', hint: 'h', color: 'var(--mz-orange)', group: 'Helm',
    when: r => r === 'helmreleases', key: e => e.key === 'h', run: s => s.openModal('helm-history') },

  // ── Actions / Navigate ───────────────────────────────────
  // Shell into a pod (or a single container from the pod drilldown) - k9s-style `s` (#81).
  { id: 'shell', label: 'Shell', hint: 's', color: 'var(--mz-accent-2)', group: 'Actions',
    when: r => r === 'pods' || r === 'containers',
    key: e => e.key === 's' && !e.ctrlKey && !e.metaKey && !e.altKey, run: s => s.openExec() },
  // Debug with an ephemeral container - kubectl-debug style `Shift+D` (#82). Injects a debug
  // image (busybox/netshoot/...) sharing the target container's process namespace, then drops
  // into a shell in it - so even a distroless pod with no shell can be inspected. (Shift+D, not
  // Shift+S: Shift+S already sorts by status, and a keyed action would shadow it on pods.)
  { id: 'debug', label: 'Debug (ephemeral)', hint: '⇧d', color: 'var(--mz-accent-2)', group: 'Actions',
    when: r => r === 'pods' || r === 'containers',
    key: e => e.key === 'D' && !e.ctrlKey && !e.metaKey && !e.altKey, run: s => s.openDebug() },
  // Copy files to/from a pod / container - kubectl cp style `Shift+C` (#108). Like shell/debug it
  // applies to a pod (defaults to its first container) and to a single container from the pod
  // drilldown. The dialog downloads a container file to the browser or uploads a picked file in.
  { id: 'copy', label: 'Copy files', hint: '⇧c', color: 'var(--mz-accent-2)', group: 'Actions',
    when: r => r === 'pods' || r === 'containers',
    key: e => e.key === 'C' && !e.ctrlKey && !e.metaKey && !e.altKey, run: s => s.openCp() },
  { id: 'forward', label: 'Port-forward', hint: '⇧f', color: 'var(--mz-orange)', group: 'Actions',
    when: r => FORWARDABLE.has(r), key: e => e.key === 'F', run: s => s.openPortForward() },
  { id: 'owner', label: 'Jump to owner', hint: '⇧j', color: 'var(--mz-accent-2)', group: 'Navigate',
    when: r => OWNED.has(r), key: e => e.key === 'J', run: s => s.jumpToOwner() },
  // Warp to the selected resource's namespace (k9s-style `w`, #90) - scopes the view to it
  // directly (like clicking a namespace header in grouped mode); toggles back to all if
  // already scoped there. Only meaningful for namespaced resources.
  { id: 'warp-ns', label: 'Warp to namespace', hint: 'w', color: 'var(--mz-accent-2)', group: 'Navigate',
    when: r => !AWS_RESOURCE_KEYS.has(r) && !CLUSTER_SCOPED_RESOURCES.has(r) && r !== 'portforwards',
    key: e => e.key === 'w', run: warpToScope },
  { id: 'warp-region', label: 'Warp to region', hint: 'w', color: 'var(--mz-accent-2)', group: 'Navigate',
    when: r => AWS_RESOURCE_KEYS.has(r) && !isGlobalScopedResource(r),
    key: e => e.key === 'w', run: warpToScope },
  // From a CRD: jump to its custom-resource instances (also Enter in the list - #20). Surfaced
  // here so it appears as a panel chip + in the palette like every other action (task 21).
  { id: 'cr-instances', label: 'View resources', hint: '↵', color: 'var(--mz-accent-2)', group: 'Navigate',
    when: r => r === 'crds',
    run: s => { const c = s.getItems().find(i => i.id === s.selectedId); if (c) s.fetchCrdResources(c.group, c.version, c.plural) } },

  // ── AWS (module #2) ──────────────────────────────────────
  // Inspect an AWS resource in depth - the AWS-native analog of describe/yaml (#2). Opens the shared
  // ActionModal in 'aws-inspect' mode: DESCRIBE / JSON (the raw Describe*/Get* output, the "yaml"
  // analog) / TAGS. READ only (no edit, no secret decode). `d` mirrors k8s describe muscle memory;
  // Enter also opens it in useKeys for every non-drillable AWS type (s3buckets drills instead).
  // s3objects is excluded (its inspect would be HeadObject metadata - deferred).
  { id: 'aws-inspect', label: 'Inspect', hint: 'd', color: 'var(--mz-alt)', group: 'Inspect',
    when: r => AWS_RESOURCE_KEYS.has(r) && r !== 's3objects',
    key: e => e.key === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey, run: s => s.openModal('aws-inspect') },
  // Related resources (phase 1) - the typed "connected resources" view, the multi-edge analog of
  // jumpToOwner. `r` opens a pick-list of the resources this one links to (EC2 -> SGs/VPC/EBS/EIP;
  // S3 bucket -> log-target/replication bucket + notification Lambdas); Enter teleports. Only the
  // AWS types with a backend related() resolver get it.
  { id: 'aws-related', label: 'Related resources', hint: 'r', color: 'var(--mz-accent-2)', group: 'Navigate',
    when: r => r === 'ec2instances' || r === 's3buckets',
    key: e => e.key === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey, run: s => s.openRelated() },
  // S3 copy/download/upload - same Shift+C muscle memory as the kubectl-cp copy above, but the
  // implementation is bucket/key blob get/put, not exec+tar (friction #5). `when` is disjoint from
  // the kubectl 'copy' action's (pods/containers), so the shared Shift+C never collides.
  { id: 's3-cp', label: 'Copy / Download', hint: '⇧c', color: 'var(--mz-accent-2)', group: 'Actions',
    when: r => r === 's3buckets' || r === 's3objects',
    key: e => e.key === 'C' && !e.ctrlKey && !e.metaKey && !e.altKey, run: s => s.openS3Cp() },
  // EC2 state transitions. start/reboot are safe (panel chips); stop/terminate are danger
  // (palette-only). No keyboard shortcuts - discoverable via the `a` palette to avoid accidents.
  { id: 'ec2-start', label: 'Start', hint: '', color: 'var(--mz-ok)', group: 'Actions',
    when: r => r === 'ec2instances', run: s => s.ec2Action('start') },
  { id: 'ec2-reboot', label: 'Reboot', hint: '', color: 'var(--mz-orange)', group: 'Actions',
    when: r => r === 'ec2instances', run: s => s.ec2Action('reboot') },

  // ── Danger ───────────────────────────────────────────────
  // ctrl+d / ctrl+k are handled directly in useKeys (multi-select aware); these entries
  // surface the same operations in the palette and carry the danger flag.
  // EC2 stop is reversible; terminate is NOT, so it gets an inline confirm (no kubectl-style
  // delete-confirm dialog exists for AWS yet).
  { id: 'ec2-stop', label: 'Stop', hint: '', color: 'var(--mz-warn)', group: 'Danger', danger: true,
    when: r => r === 'ec2instances', run: s => s.ec2Action('stop') },
  { id: 'ec2-terminate', label: 'Terminate…', hint: '', color: 'var(--mz-danger)', group: 'Danger', danger: true,
    when: r => r === 'ec2instances',
    run: s => { if (typeof window === 'undefined' || window.confirm('Terminate the selected EC2 instance(s)? This cannot be undone.')) s.ec2Action('terminate') } },
  { id: 'delete', label: 'Delete…', hint: '⌃d', color: 'var(--mz-danger-2)', group: 'Danger', danger: true,
    when: r => isStd(r), run: s => s.requestDelete() },
  { id: 'kill', label: 'Kill (no confirm)', hint: '⌃k', color: 'var(--mz-danger)', group: 'Danger', danger: true,
    when: r => isStd(r), run: s => s.killSelected() },
  // Port-forwards table (#53): stopping a forward is non-destructive, so ctrl+d and ctrl+k
  // both just stop it (no confirm dialog) via stopSelectedForwards().
  { id: 'stop-forward', label: 'Stop forward', hint: '⌃d', color: 'var(--mz-danger-2)', group: 'Danger', danger: true,
    when: r => r === 'portforwards', run: s => s.stopSelectedForwards() },
]

// Actions applicable to the active resource (optionally excluding danger ones).
export function applicableActions(resource, { includeDanger = true } = {}) {
  if (!resource) return []
  return OBJECT_ACTIONS.filter(a => a.when(resource) && (includeDanger || !a.danger))
}

// Find the action a keydown maps to (for the active resource), if any.
export function actionForKey(event, resource) {
  return OBJECT_ACTIONS.find(a => a.key && a.when(resource) && a.key(event)) || null
}

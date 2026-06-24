// k9s-style RBAC policy / access-review renderer (task 94).
//
// Renders the effective rules of a Role / ClusterRole / RoleBinding / ClusterRoleBinding /
// ServiceAccount, or the dashboard's own access review (whoami). One row per
// (apiGroup x resource): a single rule listing N resources expands to N rows, matching how
// k9s presents a policy. Verbs and resource '*' are flagged by severity. The whole thing is
// fed `filter` (the modal's `/` search term) which narrows rows by group/resource/verb/name.

const VERB_ORDER = ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete', 'deletecollection', '*']
const WRITE_VERB = /^(create|update|patch|delete|deletecollection|impersonate|escalate|bind|approve|sign)$/i

// Expand RBAC rules to flat display rows. Handles resource rules and non-resource-URL rules.
function expandRules(rules) {
  const rows = []
  for (const rule of rules || []) {
    const groups = rule.apiGroups?.length ? rule.apiGroups : ['']
    const verbs = rule.verbs || []
    const names = rule.resourceNames || []
    if (rule.resources?.length) {
      for (const resource of rule.resources)
        for (const g of groups)
          rows.push({ apiGroup: g, resource, resourceNames: names, verbs })
    } else if (rule.nonResourceURLs?.length) {
      for (const url of rule.nonResourceURLs)
        rows.push({ apiGroup: '', resource: url, resourceNames: [], verbs, nonResource: true })
    }
  }
  return rows
}

function filterRows(rows, filter) {
  if (!filter) return rows
  const q = filter.toLowerCase()
  return rows.filter(r =>
    r.resource.toLowerCase().includes(q) ||
    (r.apiGroup || 'core').toLowerCase().includes(q) ||
    r.verbs.join(' ').toLowerCase().includes(q) ||
    r.resourceNames.join(' ').toLowerCase().includes(q))
}

function Verb({ v }) {
  const all = v === '*'
  const write = all || WRITE_VERB.test(v)
  const color = all ? 'var(--mz-danger)' : write ? 'var(--mz-orange)' : 'var(--mz-ok)'
  const rgb = all ? '--mz-danger-rgb' : write ? '--mz-orange-rgb' : '--mz-ok-rgb'
  return (
    <span style={{
      fontSize: 9, padding: '0 5px', borderRadius: 2, fontFamily: 'monospace', color,
      background: `rgba(var(${rgb}),0.1)`, border: `1px solid rgba(var(${rgb}),0.28)`,
    }}>{v}</span>
  )
}

function RulesTable({ rules, filter }) {
  const rows = filterRows(expandRules(rules), filter)
  if (!rows.length) {
    return (
      <div style={{ fontSize: 11, color: 'var(--mz-text-faint)', fontStyle: 'italic', padding: '4px 0' }}>
        {filter ? 'No rules match the filter.' : 'No rules - this grants no permissions.'}
      </div>
    )
  }
  const ord = v => { const i = VERB_ORDER.indexOf(v); return i < 0 ? VERB_ORDER.length : i }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid rgba(var(--mz-orange-rgb),0.18)' }}>
          {['API GROUP', 'RESOURCE', 'NAMES', 'VERBS'].map(h => (
            <th key={h} style={{ padding: '3px 8px', textAlign: 'left', fontSize: 9, color: 'var(--mz-accent-2)', letterSpacing: '0.08em', fontWeight: 'normal' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: '1px solid rgba(var(--mz-orange-rgb),0.05)' }}>
            <td style={{ padding: '4px 8px', color: 'var(--mz-text-muted)', fontFamily: 'monospace', fontSize: 10, whiteSpace: 'nowrap' }}>
              {r.nonResource ? '' : (r.apiGroup || 'core')}
            </td>
            <td style={{ padding: '4px 8px', color: r.resource === '*' ? 'var(--mz-danger)' : 'var(--mz-accent)', fontFamily: 'monospace' }}>{r.resource}</td>
            <td style={{ padding: '4px 8px', color: 'var(--mz-text-dim)', fontFamily: 'monospace', fontSize: 10 }}>
              {r.resourceNames.length ? r.resourceNames.join(', ') : '*'}
            </td>
            <td style={{ padding: '4px 8px' }}>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {[...r.verbs].sort((a, b) => ord(a) - ord(b)).map((v, vi) => <Verb key={vi} v={v} />)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 11, padding: '1px 0' }}>
      <span style={{ color: 'var(--mz-text-faint)', minWidth: 64, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--mz-accent-2)', fontFamily: 'monospace', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

const cardStyle = {
  marginBottom: 12, padding: '8px 10px', borderRadius: 5,
  background: 'rgba(var(--mz-orange-rgb),0.05)', border: '1px solid rgba(var(--mz-orange-rgb),0.12)',
}

function SourceBlock({ src, filter }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--mz-orange)', fontFamily: 'monospace' }}>{src.source}</span>
        {src.scope && <span style={{ fontSize: 9, color: 'var(--mz-text-faint)', letterSpacing: '0.04em' }}>{src.scope}</span>}
        {src.aggregated && <span style={{ fontSize: 9, color: 'var(--mz-alt)' }}>aggregated</span>}
      </div>
      {src.error
        ? <div style={{ fontSize: 10, color: 'var(--mz-danger-2)' }}>⚠ {src.error}</div>
        : <RulesTable rules={src.rules} filter={filter} />}
    </div>
  )
}

export function PolicyView({ data, whoami, filter }) {
  if (!data) return null
  if (data.error) return <div style={{ fontSize: 11, color: 'var(--mz-danger-2)' }}>Error: {data.error}</div>

  if (whoami) {
    return (
      <div>
        <div style={cardStyle}>
          <Row label="User" value={data.user || '(unknown - SelfSubjectReview not supported by this cluster)'} />
          {data.groups?.length > 0 && (
            <div style={{ display: 'flex', gap: 8, fontSize: 11, padding: '1px 0' }}>
              <span style={{ color: 'var(--mz-text-faint)', minWidth: 64, flexShrink: 0 }}>Groups</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {data.groups.map((g, i) => (
                  <span key={i} style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--mz-alt)', background: 'rgba(var(--mz-alt-rgb),0.1)', padding: '0 5px', borderRadius: 2 }}>{g}</span>
                ))}
              </span>
            </div>
          )}
        </div>
        <div style={{ fontSize: 9, color: 'var(--mz-text-faint)', letterSpacing: '0.04em', margin: '4px 0 8px' }}>
          EFFECTIVE PERMISSIONS · namespace <span style={{ color: 'var(--mz-accent-2)' }}>{data.namespace}</span>
          {data.incomplete && <span style={{ color: 'var(--mz-warn)' }}> · partial (some rules could not be evaluated)</span>}
          {data.demo && <span style={{ color: 'var(--mz-text-faint)' }}> · demo</span>}
        </div>
        <RulesTable rules={data.rules} filter={filter} />
        {data.nonResourceRules?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 9, color: 'var(--mz-text-faint)', letterSpacing: '0.06em', marginBottom: 4 }}>NON-RESOURCE URLS</div>
            <RulesTable rules={data.nonResourceRules} filter={filter} />
          </div>
        )}
      </div>
    )
  }

  const hasHeader = data.subject || data.roleRef || data.subjects?.length
  const noSources = !data.sources?.length
  return (
    <div>
      {hasHeader && (
        <div style={cardStyle}>
          {data.subject && <Row label="Subject" value={data.subject} />}
          {data.roleRef && <Row label="Role ref" value={data.roleRef} />}
          {data.subjects?.length > 0 && <Row label="Subjects" value={data.subjects.join('   ·   ')} />}
        </div>
      )}
      {noSources && data.kind === 'ServiceAccount' && (
        <div style={{ fontSize: 11, color: 'var(--mz-text-faint)', fontStyle: 'italic' }}>
          No RoleBindings or ClusterRoleBindings reference this ServiceAccount - it has no RBAC-granted permissions.
        </div>
      )}
      {data.sources?.map((src, i) => <SourceBlock key={i} src={src} filter={filter} />)}
      {noSources && data.kind !== 'ServiceAccount' && (
        <div style={{ fontSize: 11, color: 'var(--mz-text-faint)', fontStyle: 'italic' }}>No rules.</div>
      )}
    </div>
  )
}

// Plain-text serialization of a policy / access review, for the modal's Copy button.
export function policyToText(data) {
  if (!data) return ''
  const out = []
  const fmt = rules => expandRules(rules).forEach(r => out.push(
    `  ${(r.nonResource ? '' : (r.apiGroup || 'core')).padEnd(22)} ${r.resource.padEnd(28)} ` +
    `${(r.resourceNames.length ? r.resourceNames.join(',') : '*').padEnd(16)} ${[...r.verbs].join(' ')}`))

  if (data.sources) {
    out.push(`# ${data.kind}/${data.name}${data.namespace ? ` (namespace: ${data.namespace})` : ''}`)
    if (data.subject) out.push(`# subject: ${data.subject}`)
    if (data.subjects?.length) out.push(`# subjects: ${data.subjects.join(', ')}`)
    data.sources.forEach(src => { out.push(`## ${src.source}${src.scope ? ` (${src.scope})` : ''}`); fmt(src.rules) })
    if (!data.sources.length) out.push('# (no permissions)')
  } else {
    out.push(`# access review - ${data.user || 'unknown'} (namespace: ${data.namespace})`)
    if (data.groups?.length) out.push(`# groups: ${data.groups.join(', ')}`)
    fmt(data.rules)
    if (data.nonResourceRules?.length) { out.push('# non-resource URLs'); fmt(data.nonResourceRules) }
  }
  return out.join('\n')
}

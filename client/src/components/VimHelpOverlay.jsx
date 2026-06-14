import { useEffect } from 'react'

// Vim cheatsheet for the CodeMirror-backed editor (#61). The actual keybindings are
// provided by @replit/codemirror-vim — this is just a reference. Opened with `?` from
// NORMAL/VISUAL mode (or the footer "? vim keys" hint).
const SECTIONS = [
  {
    title: 'MODES',
    color: '#ffcc00',
    keys: [
      ['i / a', 'Insert before / after cursor'],
      ['I / A', 'Insert at line start / end'],
      ['o / O', 'Open line below / above'],
      ['v / V', 'Visual / visual-line'],
      ['Ctrl-v', 'Visual block'],
      ['Esc', 'Back to normal'],
    ],
  },
  {
    title: 'MOTIONS',
    color: '#00d4ff',
    keys: [
      ['h j k l', 'Left / down / up / right'],
      ['w / b / e', 'Word fwd / back / end'],
      ['0 / ^ / $', 'Line start / first / end'],
      ['g_ ', 'Last non-blank'],
      ['gg / G', 'File top / bottom'],
      ['{n}G', 'Go to line n'],
      ['f / F / t / T', 'Find char fwd/back/till'],
      ['; / ,', 'Repeat / reverse find'],
      ['{ } / ( )', 'Paragraph / sentence'],
      ['% ', 'Matching bracket'],
    ],
  },
  {
    title: 'EDIT / OPERATORS',
    color: '#00ffaa',
    keys: [
      ['x / X', 'Delete char after / before'],
      ['r / R', 'Replace char / mode'],
      ['d{motion}', 'Delete (dw, d$, dG…)'],
      ['c{motion}', 'Change (cw, cc, C…)'],
      ['dd / cc / yy', 'Line delete / change / yank'],
      ['ciw / diw / yiw', 'Inner-word change/del/yank'],
      ['ci" ci( ci{', 'Change inside pair'],
      ['> / <', 'Indent / dedent'],
      ['~ ', 'Toggle case'],
      ['p / P', 'Paste after / before'],
      ['. ', 'Repeat last change'],
      ['u / Ctrl-r', 'Undo / redo'],
    ],
  },
  {
    title: 'SEARCH / EX / OTHER',
    color: '#aa55ff',
    keys: [
      ['/ ? ', 'Search fwd / (? = this help)'],
      ['n / N', 'Next / prev match'],
      ['* / #', 'Search word under cursor'],
      [':%s/a/b/g', 'Substitute'],
      [':{n}', 'Go to line n'],
      ['m{a} / `{a}', 'Set / jump to mark'],
      ['q{a} … q / @{a}', 'Record / play macro'],
      [':w  :wq  :q', 'Save · save+close · back'],
    ],
  },
]

function Kbd({ children }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 3, minWidth: 18,
      textAlign: 'center', fontSize: 10, color: '#9ab8d0',
      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
      fontFamily: 'inherit',
    }}>{children}</span>
  )
}

export function VimHelpOverlay({ onClose }) {
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      onClick={e => { e.stopPropagation(); onClose() }}
      style={{
        position: 'absolute', inset: 0, zIndex: 70,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(1,5,14,0.9)', backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(900px, 94vw)', maxHeight: '86vh', overflowY: 'auto',
          borderRadius: 8, background: 'rgba(2,10,22,0.98)',
          border: '1px solid rgba(255,204,0,0.3)', boxShadow: '0 0 50px rgba(255,204,0,0.12)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', borderBottom: '1px solid rgba(255,204,0,0.18)',
          position: 'sticky', top: 0, background: 'rgba(2,10,22,0.98)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 'bold', letterSpacing: '0.16em', color: '#ffcc00' }}>
            VIM KEYS — EDIT MODE
          </span>
          <span style={{ fontSize: 10, color: '#1e3a52' }}>? · ESC · close</span>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
          gap: '8px 28px', padding: '16px 22px',
        }}>
          {SECTIONS.map(section => (
            <div key={section.title}>
              <div style={{
                fontSize: 10, fontWeight: 'bold', letterSpacing: '0.12em',
                color: section.color, marginBottom: 8, marginTop: 6,
              }}>{section.title}</div>
              {section.keys.map(([k, label]) => (
                <div key={k + label} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '3px 0', fontSize: 11,
                }}>
                  <span style={{ flexShrink: 0, minWidth: 110 }}>
                    {k.split(' ').filter(Boolean).map((part, i) => (
                      <span key={part + i} style={{ marginRight: 3 }}><Kbd>{part}</Kbd></span>
                    ))}
                  </span>
                  <span style={{ color: '#7a9ab8' }}>{label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ padding: '0 22px 16px', fontSize: 10, color: '#3a5a7a' }}>
          Powered by CodeMirror vim — most standard vim commands work, including counts (e.g. 3dd, 5j).
        </div>
      </div>
    </div>
  )
}

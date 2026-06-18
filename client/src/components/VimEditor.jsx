import { useEffect, useRef } from 'react'
import { EditorView, keymap, drawSelection, highlightActiveLine, lineNumbers as cmLineNumbers } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, indentUnit } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { yaml } from '@codemirror/lang-yaml'
import { json } from '@codemirror/lang-json'
import { vim, Vim, getCM } from '@replit/codemirror-vim'

// kHUD dark theme for the editor - cyan-on-navy to match the rest of the modal.
const khudTheme = EditorView.theme({
  '&': { color: 'var(--mz-text)', backgroundColor: 'transparent', height: '100%', fontSize: '12px' },
  '.cm-content': { fontFamily: "'Courier New', monospace", caretColor: 'var(--mz-accent)', padding: '8px 0' },
  '.cm-scroller': { fontFamily: "'Courier New', monospace", lineHeight: '1.6' },
  '&.cm-focused': { outline: 'none' },
  '.cm-gutters': { backgroundColor: 'rgba(0,0,0,0.25)', color: 'var(--mz-text-faint)', border: 'none', borderRight: '1px solid rgba(var(--mz-accent-rgb),0.08)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(var(--mz-accent-rgb),0.06)', color: 'var(--mz-accent-2)' },
  '.cm-activeLine': { backgroundColor: 'rgba(var(--mz-accent-rgb),0.04)' },
  '.cm-cursor': { borderLeftColor: 'var(--mz-accent)' },
  // Block cursor in vim normal/visual mode. codemirror-vim injects a salmon (var(--mz-danger-2))
  // fat-cursor at highest precedence, so override the color with !important.
  '.cm-fat-cursor': { background: 'var(--mz-accent) !important', color: 'var(--mz-bg) !important' },
  '&:not(.cm-focused) .cm-fat-cursor': { background: 'none !important', outline: 'solid 1px var(--mz-accent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { background: 'rgba(var(--mz-accent-rgb),0.3)' },
  // Vim command line / search panel at the bottom.
  '.cm-panels': { backgroundColor: 'rgba(var(--mz-accent-rgb),0.06)', color: 'var(--mz-text)', borderTop: '1px solid rgba(var(--mz-accent-rgb),0.2)' },
  '.cm-vim-panel': { padding: '4px 10px', fontFamily: "'Courier New', monospace", fontSize: '12px' },
  '.cm-vim-panel input': { color: 'var(--mz-text)', fontFamily: "'Courier New', monospace" },
}, { dark: true })

// Syntax highlight palette (yaml / json) tuned for the dark navy background.
const khudHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.bool, t.null], color: 'var(--mz-orange)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--mz-ok)' },
  { tag: [t.number], color: 'var(--mz-warn-2)' },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: 'var(--mz-accent)' },
  { tag: [t.comment], color: 'var(--mz-accent-2)', fontStyle: 'italic' },
  { tag: [t.punctuation, t.separator], color: 'var(--mz-accent-2)' },
  { tag: [t.invalid], color: 'var(--mz-danger)' },
])

// Vim ex-commands (:w / :wq / :q) and the `?` help action are global in the vim
// singleton, so they are registered once and dispatch through this mutable handler
// object that the live VimEditor keeps pointed at its current callbacks.
const handlers = { onSave: null, onSaveClose: null, onQuit: null, onHelp: null }
let registered = false
function registerVimCommands() {
  if (registered) return
  registered = true
  Vim.defineEx('write', 'w', () => handlers.onSave?.())
  Vim.defineEx('wq', 'wq', () => handlers.onSaveClose?.())
  Vim.defineEx('xit', 'x', () => handlers.onSaveClose?.())
  Vim.defineEx('quit', 'q', () => handlers.onQuit?.())
  // :q! - vim passes bang via params; treat any quit variant the same here.
  Vim.defineAction('khudHelp', () => handlers.onHelp?.())
  Vim.mapCommand('?', 'action', 'khudHelp', {}, { context: 'normal' })
  Vim.mapCommand('?', 'action', 'khudHelp', {}, { context: 'visual' })
}

const languageOf = lang => (lang === 'json' ? json() : yaml())

export function VimEditor({
  value, onChange, vimEnabled = true, showLineNumbers = true,
  language = 'yaml', onSave, onSaveClose, onQuit, onRequestHelp, onModeChange,
  editorRef,
}) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  const vimCompartment  = useRef(new Compartment())
  const gutterCompartment = useRef(new Compartment())
  const langCompartment = useRef(new Compartment())
  // Keep the latest onChange without rebuilding the editor.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Point the global vim command handlers at this instance's callbacks every render.
  handlers.onSave      = onSave
  handlers.onSaveClose = onSaveClose
  handlers.onQuit      = onQuit
  handlers.onHelp      = onRequestHelp

  // Build the editor once.
  useEffect(() => {
    registerVimCommands()
    const updateListener = EditorView.updateListener.of(u => {
      if (u.docChanged) onChangeRef.current?.(u.state.doc.toString())
    })
    const state = EditorState.create({
      doc: value ?? '',
      extensions: [
        // vim() must precede other keymaps so it wins key dispatch.
        vimCompartment.current.of(vimEnabled ? vim() : []),
        gutterCompartment.current.of(showLineNumbers ? cmLineNumbers() : []),
        history(),
        drawSelection(),
        highlightActiveLine(),
        indentOnInput(),
        bracketMatching(),
        indentUnit.of('  '),
        langCompartment.current.of(languageOf(language)),
        syntaxHighlighting(khudHighlight),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        khudTheme,
        updateListener,
        EditorView.lineWrapping,
      ],
    })
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    if (editorRef) editorRef.current = view
    view.focus()

    // Mode-change events (NORMAL / INSERT / VISUAL) for the footer.
    const cm = getCM(view)
    if (cm && onModeChange) {
      const cb = m => onModeChange(m?.mode || 'normal')
      cm.on('vim-mode-change', cb)
    }

    return () => { view.destroy(); viewRef.current = null; if (editorRef) editorRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push external value changes (e.g. secret decode) into the doc.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const cur = view.state.doc.toString()
    if (value != null && value !== cur) {
      view.dispatch({ changes: { from: 0, to: cur.length, insert: value } })
    }
  }, [value])

  // Reconfigure toggles without rebuilding.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: vimCompartment.current.reconfigure(vimEnabled ? vim() : []) })
    viewRef.current?.focus()
  }, [vimEnabled])
  useEffect(() => {
    viewRef.current?.dispatch({ effects: gutterCompartment.current.reconfigure(showLineNumbers ? cmLineNumbers() : []) })
  }, [showLineNumbers])
  useEffect(() => {
    viewRef.current?.dispatch({ effects: langCompartment.current.reconfigure(languageOf(language)) })
  }, [language])

  return <div ref={hostRef} style={{ height: '100%', overflow: 'hidden' }} />
}

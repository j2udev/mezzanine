// ── Theme system (#14) ───────────────────────────────────────────────────────
// One source of truth for every color in the app. Each theme is a flat map of
// SEMANTIC tokens. Two consumers:
//   1. CSS custom properties - applyTheme() writes every token to :root as
//      `--mz-<token>` (and RGB triplets as `--mz-<token>-rgb` for rgba() glows).
//      The bulk of the UI uses inline `var(--mz-…)`, so a theme switch repaints
//      with no React re-render.
//   2. JS - statusColor()/getNsColor() (constants.js) need real hex strings for
//      `${color}<alpha>` math, so they read the live ACTIVE palette object here.
//
// To add a theme: add an entry to THEMES. To add a token: add it to every theme
// and (if used in an rgba glow) give it an `*Rgb` triplet.

const hexToRgb = (hex) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

// Semantic tokens. Status/namespace palettes hang off `status`/`ns`.
export const THEMES = {
  mezzanine: {
    id: 'mezzanine',
    name: 'Mezzanine Neon',
    blurb: 'The original - neon cyan on near-black.',
    swatch: ['#00d4ff', '#aa55ff', '#00ffaa'],
    tokens: {
      bg:          '#0a1220',
      surface:     '#0c1626', // rgba surfaces / panels
      backdrop:    '#01050e', // modal backdrops / deep wells
      border:      '#1b3048',
      'text-bright': '#f0f8ff',
      text:        '#cce0f5',
      'text-mid':  '#a8c4dc',
      'text-dim':  '#7aa8c8',
      'text-faint':'#6488a8',
      'text-muted':'#a0b2c4',
      accent:        '#00e0ff',
      'accent-strong':'#00b8ff',
      'accent-2':  '#8cc8e8',
      info:        '#44aaff',
      alt:         '#aa55ff',
      ok:          '#00ffaa',
      warn:        '#ffcc00',
      'warn-2':    '#ffcc44',
      orange:      '#ff8844',
      danger:      '#ff4455',
      'danger-2':  '#ff6677',
      pink:        '#ff4488',
      neutral:     '#667788',
    },
    // Status → token. statusColor() resolves through this then the token map.
    status: {
      Running: 'ok', Available: 'ok', Ready: 'ok', Bound: 'ok', Deployed: 'ok',
      Pending: 'warn', Suspended: 'warn', Terminating: 'warn', ContainerCreating: 'warn', Warning: 'warn',
      Failed: 'danger', Degraded: 'danger', NotReady: 'danger', Blocking: 'danger',
      Succeeded: 'info', Complete: 'info', Completed: 'info', Active: 'accent', Normal: 'accent', Progressing: 'info',
      Released: 'alt',
      'Scaled Down': 'neutral', Superseded: 'neutral', Unknown: 'neutral',
    },
    // Namespace hue palette (stable per-name hash in getNsColor).
    ns: ['#00d4ff', '#aa55ff', '#ffaa00', '#00ffaa', '#ff4488', '#44aaff',
         '#ffdd00', '#88ffaa', '#ff8844', '#55ddff', '#cc88ff', '#66ffcc'],
  },

  devopsbb: {
    id: 'devopsbb',
    name: 'DevOps Building Blocks',
    blurb: 'Bold brand red / yellow / blue on warm charcoal.',
    swatch: ['#3b82f6', '#f5c518', '#e03b2a'],
    tokens: {
      // Warm near-neutral charcoal (not blue-black) so the red/yellow/blue read as the
      // brand instead of blending into a navy that looks like the Mezzanine theme.
      bg:          '#16171d',
      surface:     '#1e2029',
      backdrop:    '#0a0a0e',
      border:      '#33323c',
      'text-bright': '#f6f7fa',
      text:        '#e4e6ec',
      'text-mid':  '#c2c6d0',
      'text-dim':  '#a3a9b5',   // neutral gray, not blue-gray
      'text-faint':'#7e8492',
      'text-muted':'#959aa6',
      // Primary accent = bold, saturated brand BLUE (selection, focus, links, wordmark).
      accent:        '#3b82f6',
      'accent-strong':'#2b5ab7',
      // Secondary accent = brand GOLD. It's the most-used "data" color (IPs, counts,
      // versions, sidebar text), so this is what injects yellow across the whole UI.
      'accent-2':  '#e0a93c',
      info:        '#3b82f6',
      // Category / type labels (service type, schedule, roles, storageclass) = brand RED.
      alt:         '#e8513f',
      ok:          '#3fb37a',
      warn:        '#f5c518',     // brand yellow (status: Pending/Warning)
      'warn-2':    '#ffd75e',
      orange:      '#f0883a',
      danger:      '#e03b2a',     // brand red (status: Failed/Degraded)
      'danger-2':  '#f0675a',
      pink:        '#e0518a',
      neutral:     '#6a7080',
    },
    status: {
      Running: 'ok', Available: 'ok', Ready: 'ok', Bound: 'ok', Deployed: 'ok',
      Pending: 'warn', Suspended: 'warn', Terminating: 'warn', ContainerCreating: 'warn', Warning: 'warn',
      Failed: 'danger', Degraded: 'danger', NotReady: 'danger', Blocking: 'danger',
      Succeeded: 'info', Complete: 'info', Completed: 'info', Active: 'accent', Normal: 'accent', Progressing: 'info',
      Released: 'alt',
      'Scaled Down': 'neutral', Superseded: 'neutral', Unknown: 'neutral',
    },
    // Namespace hues lead with brand blue / red / yellow / green.
    ns: ['#3b82f6', '#e03b2a', '#f5c518', '#3fb37a', '#e8513f', '#2b5ab7',
         '#e0a93c', '#5a8fd8', '#e0518a', '#f0883a', '#7ed0a0', '#89b4fa'],
  },
}

// Translucent variant of any color (hex OR a `var(--mz-…)` token). Replaces the old
// `${hex}<alpha>` string-concat trick, which can't work once colors are CSS variables.
// `pct` is 0–100 (percent opacity). Used for chip tints, hover fills, dim text, etc.
export const alpha = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`

export const DEFAULT_THEME = 'mezzanine'
const STORAGE_KEY = 'mezz-theme'

// Live palette the JS consumers read (statusColor/getNsColor). Mutated by applyTheme.
export let ACTIVE = THEMES[DEFAULT_THEME]

export function getStoredThemeId() {
  try {
    const id = localStorage.getItem(STORAGE_KEY)
    if (id && THEMES[id]) return id
  } catch { /* ignore */ }
  return DEFAULT_THEME
}

// Write a theme's tokens to :root as CSS variables and update the live palette.
export function applyTheme(id) {
  const theme = THEMES[id] || THEMES[DEFAULT_THEME]
  ACTIVE = theme
  const root = document.documentElement
  for (const [key, hex] of Object.entries(theme.tokens)) {
    root.style.setProperty(`--mz-${key}`, hex)
    root.style.setProperty(`--mz-${key}-rgb`, hexToRgb(hex).replace(/ /g, ','))
  }
  try { localStorage.setItem(STORAGE_KEY, theme.id) } catch { /* ignore */ }
  return theme
}

// Apply the persisted (or default) theme immediately on import, before first paint.
if (typeof document !== 'undefined') applyTheme(getStoredThemeId())

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
      bg:          '#0f1a2e', // lifted from #0a1220 - was reading dark-on-dark
      surface:     '#13233c', // rgba surfaces / panels
      backdrop:    '#040b18', // modal backdrops / deep wells
      border:      '#244062',
      'text-bright': '#f4fbff',
      text:        '#dcefff',
      'text-mid':  '#bcd8f0',
      'text-dim':  '#92bdda',
      'text-faint':'#7aa3c2',
      'text-muted':'#b2c6d8',
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
    blurb: 'Brand red / yellow / blue on the site\'s own dark (Catppuccin-style) base.',
    // Matches devopsbuildingblocks.com: brand blue / yellow / red.
    swatch: ['#89b4fa', '#f5c518', '#e03b2a'],
    tokens: {
      // Base mirrors the site's dark theme: --white #1e1e2e (page bg), --surface #2a2a3e,
      // and the deep --hero-bg #0e1724 for the deepest wells. Border = the site's #45475a.
      bg:          '#1e1e2e',  // site dark --white (page background)
      surface:     '#2a2a3e',  // site dark --surface
      backdrop:    '#0e1724',  // site --hero-bg (deep well / modal backdrop)
      border:      '#45475a',  // site dark --border
      // Text tiers track the site's dark --dark / --mid / --muted (Catppuccin grays).
      'text-bright': '#eef1fb',
      text:        '#cdd6f4',  // site dark --dark (body text)
      'text-mid':  '#bac2de',
      'text-dim':  '#a6adc8',  // site dark --mid
      'text-faint':'#8891a8',  // site dark --muted
      'text-muted':'#9399b2',
      // Primary accent = brand BLUE (selection, focus, links, wordmark). The site's dark
      // theme lifts --blue to #89b4fa for legibility on dark, so we follow it; the deeper
      // brand blue #2b5ab7 (light-theme --blue) is the strong/pressed variant.
      accent:        '#89b4fa',
      'accent-strong':'#2b5ab7',
      // Secondary accent = brand GOLD. It's the most-used "data" color (IPs, counts,
      // versions, sidebar text), so this is what injects yellow across the whole UI.
      'accent-2':  '#f5c518',  // brand --yellow
      info:        '#89b4fa',
      // Category / type labels (service type, schedule, roles, storageclass) = brand RED.
      alt:         '#e03b2a',  // brand --red
      ok:          '#a6e3a1',  // Catppuccin green, complements the dark base
      warn:        '#f5c518',  // brand --yellow (status: Pending/Warning)
      'warn-2':    '#fad94c',
      orange:      '#f0883a',
      danger:      '#e03b2a',  // brand --red (status: Failed/Degraded)
      'danger-2':  '#f0675a',  // brand --red lightened toward --red-light tint
      pink:        '#f38ba8',
      neutral:     '#7f849c',  // Catppuccin overlay gray
    },
    status: {
      Running: 'ok', Available: 'ok', Ready: 'ok', Bound: 'ok', Deployed: 'ok',
      Pending: 'warn', Suspended: 'warn', Terminating: 'warn', ContainerCreating: 'warn', Warning: 'warn',
      Failed: 'danger', Degraded: 'danger', NotReady: 'danger', Blocking: 'danger',
      Succeeded: 'info', Complete: 'info', Completed: 'info', Active: 'accent', Normal: 'accent', Progressing: 'info',
      Released: 'alt',
      'Scaled Down': 'neutral', Superseded: 'neutral', Unknown: 'neutral',
    },
    // Namespace hues lead with brand blue / red / yellow / green over the site's dark base.
    ns: ['#89b4fa', '#e03b2a', '#f5c518', '#a6e3a1', '#74a7f8', '#2b5ab7',
         '#fad94c', '#5a8fd8', '#f38ba8', '#f0883a', '#94e2d5', '#b4befe'],
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

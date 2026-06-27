# k8s-dashboard - Claude Code Context

## Writing Conventions

**Do not use em dashes (—) anywhere** - not in code, comments, UI strings,
commit messages, docs, or this file. Use a spaced hyphen `-`, a colon, or
restructure the sentence instead. This applies to all generated content for this
project.

## Project Overview

**Mezzanine** (shorthand **mezz**) - "the best seat in the house" - a
k9s-inspired Kubernetes dashboard. Single-port (3001) Express+WebSocket backend
serving a React+Vite frontend. Falls back to a demo mock cluster if no live k8s
is available. (The repo directory is still `k8s-dashboard`; the product/wordmark
is **Mezzanine**, rendered in a self-hosted neon-cursive font - `.mezz-wordmark`
in `client/src/index.css`, served from `client/public/fonts/pacifico.woff2`.)

## Architecture

```
/workspaces/k8s-dashboard/
├── src/
│   ├── server.js       # Express + WS server, all /api/* endpoints, static serving
│   ├── k8s.js          # fetchResources() - k8s client, falls back to demo
│   └── mock.js         # getMockResources/Logs/Describe/Yaml - demo data
├── client/
│   └── src/
│       ├── store.js                    # Zustand store - all state
│       ├── actions.js                  # OBJECT_ACTIONS registry - single source of truth for per-object actions
│       ├── App.jsx                     # Root layout: sidebar + list + panel
│       ├── components/
│       │   ├── Sidebar.jsx             # Left nav: collapsible groups, alt+j/k nav
│       │   ├── HUD.jsx                 # Top/bottom bars, filter, command mode
│       │   ├── ResourceList.jsx        # Namespace-grouped scrollable list
│       │   ├── ResourceRow.jsx         # Per-resource-type row columns
│       │   ├── DetailPanel.jsx         # Right panel: detail + wrapping action chips (from registry)
│       │   ├── ActionModal.jsx         # Full-screen modal: logs/describe/yaml/json/edit/helm
│       │   ├── VimEditor.jsx           # CodeMirror 6 + @replit/codemirror-vim editor (edit mode, #61/#62)
│       │   ├── VimHelpOverlay.jsx      # ? vim cheatsheet shown over the edit modal (#61)
│       │   ├── ActionMenu.jsx          # Actions palette (a) - all applicable actions, grouped/filterable
│       │   ├── PortForwardModal.jsx    # Shift+F port-forward dialog (port suggestions from object)
│       │   ├── ExecModal.jsx           # `s` interactive pod shell - xterm + /ws/exec websocket (#81)
│       │   ├── DebugModal.jsx          # Shift+D ephemeral debug container dialog (#82, hands off to ExecModal)
│       │   ├── CopyModal.jsx           # Shift+C kubectl-cp file transfer dialog (download/upload, #108)
│       │   ├── PolicyView.jsx          # RBAC policy / access-review rules table (#94, rendered inside ActionModal)
│       │   └── HelpModal.jsx           # ? shortcuts overlay
│       └── hooks/
│           ├── useWS.js                # WS connection + initial HTTP fetch
│           └── useKeys.js              # k9s-style keyboard shortcuts (dispatches object actions via actions.js)
├── scripts/
│   └── setup-cluster.sh               # Idempotent demo cluster setup (kind)
├── start.sh                            # Build (if needed) + run server
└── CLAUDE.md                           # This file
```

## Build & Run

```bash
bash /workspaces/k8s-dashboard/start.sh
```

- Skips vite build if `client/dist/` already exists (avoids 2-min timeout)
- After editing frontend code, rebuild with the **throttled** wrapper - a plain
  `vite build` spikes all cores and crashes the devcontainer (see below):
  `bash /workspaces/k8s-dashboard/scripts/safe-build.sh`
- Server log: `/tmp/k8s-backend.log`
- Health check: `curl http://localhost:3001/api/health`

```bash
# Demo cluster (kind, installs helm charts + demo resources)
bash /workspaces/k8s-dashboard/scripts/setup-cluster.sh
```

## Testing - Playwright is Required

**Always test UI changes with the Playwright MCP browser before reporting
done.**

The Playwright MCP server is pre-installed. Use it to:

1. Take screenshots to verify visual state
2. Press keys to test keyboard navigation
3. Check the UI actually renders correctly, not just that the build passes

Typical test flow:

```
mcp__playwright__browser_navigate  → http://localhost:3001
mcp__playwright__browser_take_screenshot  → verify current state
mcp__playwright__browser_press_key  → test keyboard interactions
mcp__playwright__browser_snapshot  → get element refs for typing
mcp__playwright__browser_type  → type into inputs (requires target ref)
```

After testing is complete, always clean up:

- **Close the browser tab**: call `mcp__playwright__browser_close` when done -
  open tabs consume significant CPU.
- **Delete screenshots as soon as you're done with them**: never leave
  screenshot files behind. Remove them the moment you've reviewed them - do not
  wait until the very end of the task. This includes the default
  `.playwright-mcp/page-*.png`/`*.yml` files **and** any custom-named screenshot
  (e.g. a `filename:` you passed to `browser_take_screenshot` lands in the repo
  root / cwd, like `main.png`, not in `.playwright-mcp/`). They accumulate
  quickly and inflate file-watch load.

```bash
# default snapshot/screenshot artifacts
rm -f /workspaces/k8s-dashboard/.playwright-mcp/page-*.png /workspaces/k8s-dashboard/.playwright-mcp/page-*.yml
# any custom-named screenshots you saved (adjust the name as needed)
rm -f /workspaces/k8s-dashboard/*.png
```

If the browser lock is stale, remove:

```bash
rm ~/.cache/ms-playwright-mcp/mcp-chrome-for-testing-b2bf846/SingletonLock
rm ~/.cache/ms-playwright-mcp/mcp-chrome-for-testing-b2bf846/SingletonCookie
```

## Keyboard Navigation (k9s-style)

### Main view (`useKeys.js`)

| Key               | Action                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `j / k`           | Navigate rows up/down                                                                                                                                            |
| `ctrl+j / ctrl+k` | Navigate sidebar items (sidebar expanded)                                                                                                                        |
| `n / N`           | Cycle namespace                                                                                                                                                  |
| `/`               | Filter                                                                                                                                                           |
| `:`               | Command mode (e.g. `:pods`, `:ns`)                                                                                                                               |
| `ctrl+d`          | Delete with confirmation                                                                                                                                         |
| `Enter`           | Drill into resource                                                                                                                                              |
| `[ / ]`           | Nav back / forward                                                                                                                                               |
| `l d y e`         | Open logs / describe / yaml / edit modal - d/y/e share ONE unified inspect modal                                                                                 |
| `x`               | Secrets: open inspect modal pre-decoded (k9s-style)                                                                                                              |
| `p` / `Enter`     | RBAC (roles/clusterroles/role&clusterrolebindings/serviceaccounts): open the policy / rules view (#94). SA = rules aggregated across every binding that names it |
| `v m n h`         | Helm release: values / manifest / notes / history modal                                                                                                          |
| `s`               | Shell into selected pod (or a single container from the pod drilldown) - interactive terminal (#81)                                                              |
| `Shift+D`         | Debug pod/container with an ephemeral container, then shell in (#82)                                                                                             |
| `Shift+C`         | Copy files to/from a pod/container - kubectl cp download/upload dialog (#108)                                                                                     |
| `Shift+F`         | Port-forward selected pod / service / deployment / statefulset                                                                                                   |
| `Shift+J`         | Jump to owner (pod/replicaset → controller; job → cronjob)                                                                                                       |
| `a`               | Actions palette - all actions applicable to the selection                                                                                                        |
| `Shift+T`         | Theme switcher (also `:theme`) - j/k live-previews, Enter applies, Esc reverts                                                                                   |
| `gg / G`          | Go to first / last item in the resource list                                                                                                                     |
| `ctrl+g`          | Toggle namespace grouping (flat list ⇄ grouped headers; flat is default)                                                                                         |
| `Space`           | Toggle multi-select on current item (no cursor advance)                                                                                                          |
| `ctrl+d`          | Delete with confirmation (multi-select aware)                                                                                                                    |
| `ctrl+k`          | Kill instantly (multi-select aware)                                                                                                                              |
| `Esc`             | Step back through state                                                                                                                                          |

> **Object actions are defined ONCE in `client/src/actions.js`**
> (`OBJECT_ACTIONS`). `l/d/y/e/x/v/m/n/h/s/Shift+F/Shift+J` are NOT hardcoded in
> useKeys - useKeys dispatches them via `actionForKey(event, resource)`. See
> "Adding object actions" below. (Pure navigation/sort/delete/`a` stay in
> useKeys; ctrl+d/ctrl+k are special-cased there because they are multi-select
> aware.)

### ActionModal (`ActionModal.jsx`) - capture-phase listener

| Key               | Action                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------- |
| `j / k`           | Scroll ±22px                                                                           |
| `gg / G`          | Top / bottom                                                                           |
| `Ctrl-d/u`        | Half-page scroll                                                                       |
| `Ctrl-f/b`        | Full-page scroll                                                                       |
| `Tab / Shift+Tab` | Cycle DESCRIBE → YAML → JSON read view (inspect modal)                                 |
| `/`               | Open search                                                                            |
| `n / N`           | Next / prev match                                                                      |
| `c`               | Copy (non-edit mode) - copies the on-screen view (describe/yaml/json)                  |
| `e`               | From a read view: enter edit mode (forces YAML, line numbers on)                       |
| `?`               | In edit mode: open the vim cheatsheet overlay (VimHelpOverlay)                         |
| `Esc`             | Read view: clearSearch → close. In edit mode CodeMirror owns Esc (insert→normal, etc.) |
| `#`               | Toggle line numbers (all inspect read views + edit)                                    |

### Unified inspect modal (ActionModal.jsx) - describe/yaml/edit

- `d`, `y`, `e` all open the SAME modal: `d`→DESCRIBE view, `y`→YAML view,
  `e`→edit mode
- Footer DESCRIBE/YAML/JSON toggle group + `Tab`/`Shift+Tab` cycles formats;
  each format lazily fetched once and cached per item (`fetchedRef`), so
  toggling is instant
- All read views render through the shared `ContentLines` (line numbers +
  search + match refs)
- `e` from a read view → edit mode (forces yaml, NORMAL, line numbers on by
  default); `i` from NORMAL → INSERT
- `Esc` from INSERT → NORMAL; from NORMAL → back to read view; again → close
- Copy / secret-decode operate on the currently displayed view; `x` decodes in
  place on YAML **and** JSON (DESCRIBE has no decodable data block, so `x` there
  snaps to decoded YAML)
- Helm Values modal: single view with USER/ALL footer toggle (re-fetches with
  `?all=true`)
- Search highlighting preserves syntax colors - matched substring highlighted
  within each span

### Edit vim mode - CodeMirror 6 + `@replit/codemirror-vim` (#61, #62)

Edit mode renders `client/src/components/VimEditor.jsx`, a CodeMirror 6
`EditorView` that **owns the buffer and the entire vim engine** (counts,
operator+motion, text objects `ciw`/ `diw`/`ci"`, `f/F/t/T`/`;`/`,`,
`u`/`Ctrl-r`, `.` repeat, registers, `q` macros, ex commands). It also gives
yaml/json **syntax highlighting** (partial #62). `vim.js` was deleted.

Integration contract (see `ActionModal.jsx`):

- The modal’s capture-phase key handler **early-returns whenever `editMode` is
  true** - it yields every key to CodeMirror (motions, `Esc`, `:`, `/`, `?`).
  Read views / logs are unchanged.
- Ex commands are registered **once** in VimEditor via `Vim.defineEx`:
  `:w`→onSave, `:wq`/`:x` →onSaveClose, `:q`/`:q!`→onQuit (back to read). They
  dispatch through a module-level `handlers` object the live editor keeps
  pointed at the current ActionModal callbacks.
- `handleSave` reads the **live doc** (`editViewRef.current.state.doc`), not
  React state.
- `?` is mapped (normal+visual) via `Vim.defineAction`+`Vim.mapCommand` to open
  `VimHelpOverlay`.
- Vim on/off, line numbers, and language are swapped through CodeMirror
  `Compartment`s without remounting. VIM toggle off = plain CodeMirror (native
  caret/typing).
- `vimMode` state (from the `vim-mode-change` event) drives the footer
  NORMAL/INSERT/VISUAL chip.
- Secret decode in edit is the **footer Decode button only** (`x` is now vim
  delete-char); it transforms the live text and pushes it back through the
  `value` prop.

## Object Actions (`client/src/actions.js`) - the scalable pattern

`OBJECT_ACTIONS` is the **single source of truth** for everything you can do to
a selected object. Each entry drives three consumers automatically:

- **DetailPanel** - renders applicable non-danger actions as wrapping chips (+
  an `a ⋯` button)
- **ActionMenu** (`a` palette) - lists ALL applicable actions, grouped by
  `group`, filterable
- **useKeys** - dispatches `key`-matching, non-danger actions via
  `actionForKey(event, resource)`

**To add a new object interaction, add ONE entry - do not hardcode buttons or
key cases:**

```js
{ id: 'restart', label: 'Restart', hint: 'r', color: '#ffaa00', group: 'Actions',
  when: r => r === 'deployments' || r === 'statefulsets',  // applicability by resource
  key:  e => e.key === 'r',                                 // optional keyboard trigger
  run:  s => s.restartWorkload() }                          // s = useStore.getState()
```

Fields: `id`, `label`, `hint` (display key), `color`, `group` (palette section),
`danger` (destructive - kept out of the panel chips, shown only in the palette),
`when(resource)`, `key(event)` (optional), `run(store)`. Put the actual behavior
on the **store** and call it from `run` so it can be reused. Helpers:
`applicableActions(resource, {includeDanger})`, `actionForKey(event, resource)`.
Destructive ctrl+d/ctrl+k key handling stays in useKeys (multi-select aware) but
their palette entries live in the registry (`requestDelete`/`killSelected`).

## Theming (`client/src/theme.js`) - semantic tokens, not inline hex (#14)

`theme.js` is the **single source of truth for every color**. Each theme is a
flat map of SEMANTIC tokens (`bg`, `text`/`text-dim`/`text-faint`/…, `accent`,
`accent-2`, `ok`, `warn`, `danger`, `alt`, …) plus a `status` map (status →
token) and a `ns` hue palette. **The app contains NO raw hex** outside
`theme.js` - everything is `var(--mz-<token>)` (and
`rgba(var(--mz-<token>-rgb), α)` for glows).

How it works:

- `applyTheme(id)` writes every token to `:root` as `--mz-<token>` **and** an
  RGB triplet `--mz-<token>-rgb` (for `rgba()`), and updates a module-level
  `ACTIVE` palette object. It runs on import (reading
  `localStorage['mezz-theme']`) so colors are set before first paint;
  `index.css` also hard-codes the Mezzanine defaults on `:root` as an anti-FOUC
  fallback.
- Because the bulk of colors are CSS vars, **a theme switch repaints with no
  React re-render.** The only JS-side colors are `statusColor()`/`getNsColor()`
  (`constants.js`), which read `ACTIVE` so they can return real hex for
  `${color}+alpha` math. App.jsx subscribes to `themeId` so those JS-computed
  colors re-resolve on switch (children aren't memoized, so the App re-render
  cascades).
- **Never write `${someColor}18`-style alpha concat** - that breaks once a color
  is a CSS var. Use `alpha(color, pct)` from `theme.js` (→
  `color-mix(in srgb, color pct%, transparent)`), which works for both hex and
  `var(--mz-*)`.
- `store.themeId` / `setTheme(id)` / `themePickerOpen`. `ThemePicker.jsx`
  (Shift+T or `:theme`) j/k live-previews (calls `setTheme` as you move), Enter
  commits, Esc reverts to the theme that was active when it opened.

**To add a theme:** add one entry to `THEMES` (tokens + status map + ns
palette + swatch/blurb). **To add a token:** add it to every theme's `tokens`,
the `:root` fallback in `index.css`, and use it as `var(--mz-<token>)`.

## API Endpoints (src/server.js)

| Method | Path                                               | Description                                                                                                                                                                                                                                                                                                       |
| ------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/logs/:namespace/:pod`                        | Pod logs. Params: `tail`, `sinceSeconds`, `container`                                                                                                                                                                                                                                                             |
| GET    | `/api/logs-multi/:resource/:namespace/:name`       | Multi-pod logs (deployments etc.)                                                                                                                                                                                                                                                                                 |
| GET    | `/api/describe/:resource/:namespace/:name`         | `kubectl describe` output                                                                                                                                                                                                                                                                                         |
| GET    | `/api/yaml/:resource/:namespace/:name`             | `kubectl get -o yaml` output                                                                                                                                                                                                                                                                                      |
| GET    | `/api/json/:resource/:namespace/:name`             | `kubectl get -o json` output                                                                                                                                                                                                                                                                                      |
| POST   | `/api/edit`                                        | `kubectl apply -f -` (body = raw YAML)                                                                                                                                                                                                                                                                            |
| DELETE | `/api/delete/:resource/:namespace/:name`           | `kubectl delete --wait=false`                                                                                                                                                                                                                                                                                     |
| GET    | `/api/helm/values/:namespace/:name`                | Helm user values (`?all=true` for computed)                                                                                                                                                                                                                                                                       |
| GET    | `/api/helm/manifest/:namespace/:name`              | Helm rendered manifest                                                                                                                                                                                                                                                                                            |
| GET    | `/api/helm/notes/:namespace/:name`                 | Helm release notes                                                                                                                                                                                                                                                                                                |
| GET    | `/api/helm/history/:namespace/:name`               | Helm revision history (JSON)                                                                                                                                                                                                                                                                                      |
| POST   | `/api/helm/rollback/:namespace/:name/:revision`    | Helm rollback to revision                                                                                                                                                                                                                                                                                         |
| GET    | `/api/port-forward`                                | List active port-forwards                                                                                                                                                                                                                                                                                         |
| POST   | `/api/port-forward/:resource/:namespace/:name`     | Start `kubectl port-forward` (body `{localPort, remotePort}`)                                                                                                                                                                                                                                                     |
| DELETE | `/api/port-forward/:id`                            | Stop a port-forward (kills the child process)                                                                                                                                                                                                                                                                     |
| GET    | `/api/crd/:group/:version/:plural`                 | List custom resources for a CRD                                                                                                                                                                                                                                                                                   |
| POST   | `/api/debug/:namespace/:pod`                       | Inject an ephemeral debug container (body `{image, target?}`); returns `{container}` (#82). Live cluster only                                                                                                                                                                                                      |
| GET    | `/api/cp/:namespace/:pod/:container?path=`         | kubectl cp DOWNLOAD (#108): streams the container file as itself, or a directory as `<base>.tar`. Live cluster only                                                                                                                                                                                                |
| POST   | `/api/cp/:namespace/:pod/:container?path=&name=`   | kubectl cp UPLOAD (#108): raw octet-stream body staged + `kubectl cp` into `<path>/<name>`. Returns `{ok, path}`. Live cluster only                                                                                                                                                                                |
| GET    | `/api/rbac/policy/:kind/:namespace/:name`          | Effective RBAC policy (#94). `kind` = roles/clusterroles/role&clusterrolebindings/serviceaccounts. Returns `{kind,name,namespace,subject?,roleRef?,subjects?,sources:[{source,scope,aggregated,rules,error?}]}`. SA aggregates all bindings that name it; bindings resolve their roleRef. Cluster-scoped ns = `_` |
| GET    | `/api/rbac/can-i?namespace=`                       | Self access review for the dashboard's own identity (#94, the `kubectl auth can-i --list` mechanism via SelfSubjectRulesReview + SelfSubjectReview). Returns `{user,groups,namespace,rules,nonResourceRules,incomplete}`                                                                                          |
| WS     | `/ws/exec?namespace&pod&container&shell&cols&rows` | Interactive pod shell (#81). Binary frames = stdin/stdout bytes; text frames = JSON control (`{type:'resize'}` in, `{type:'ready'\|'error'\|'exit'}` out). Bridges client-node `Exec` ⇄ browser xterm. Live cluster only                                                                                          |
| GET    | `/api/health`                                      | `{"ok":true,"demoMode":bool}`                                                                                                                                                                                                                                                                                     |

kubectl path:
`/workspaces/k8s-dashboard/.devbox/nix/profile/default/bin/kubectl`

## Known Gotchas

### React Hooks

- All `useMemo`/`useCallback`/`useEffect` must be declared **before** any early
  return (e.g. `if (!modal) return null`). Violating this causes React error
  #310 / "can't access lexical declaration before initialization" (TDZ crash).
- When a `useCallback` is referenced in a `useEffect` dependency array, the
  callback must be declared **above** the effect in the file.

### Event listeners

- Modal vim keys use `window.addEventListener('keydown', handler, true)` -
  **capture phase** - to intercept before inputs steal focus.
- Sidebar alt+j/k also uses capture phase on `window`. useKeys.js uses bubble
  phase.
- Ctrl+J opens Chrome Downloads; use Alt+J/K for sidebar navigation instead.

### Layout

- `PANEL_W = 310` in `App.jsx` - detail panel width
- Detail panel is position:absolute on the right. ResourceList container shrinks
  its `right` edge by PANEL_W when panel is open, so columns stay visible.
- Sidebar: collapsed = 36px, expanded = 200px

### Nix / devcontainer

- Playwright needs `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` (set in
  `.mcp.json`)
- VS Code "container crash" messages are session reconnects, NOT real restarts -
  kube-apiserver stays up
- `start.sh` uses `nohup` so server survives session reconnects

### Devcontainer Crash Prevention

The "crashes" are VS Code remote-server **session reconnects**, not real
restarts - confirmed by the fact that kube-apiserver and `src/server.js` stay up
across them. The trigger is a short **CPU spike** that starves the VS Code
heartbeat thread on the Docker Desktop linuxkit VM (the container has NO cgroup
cpu/mem cap and ~26Gi free, so it is **not** an OOM). The crashes have a high
_baseline_ load too - VS Code was watching ~25k files in `node_modules` with no
excludes, which on its own pushes idle load to ~3.4/8 cores and makes any spike
tip over.

**Two structural fixes applied (require one `Developer: Reload Window` to take
effect):**

- `.vscode/settings.json` - `files.watcherExclude`/`search.exclude` for
  `node_modules`, `dist`, `.devbox`, `.playwright-mcp`. Cuts the baseline watch
  load. Reload Window also reaps the accumulated stale helpers.
- `.devcontainer/devcontainer.json` - port 3001 `onAutoForward` changed
  `openBrowser`→`silent`. It was opening a real browser tab (and a CPU spike) on
  **every** `start.sh` server restart.

A cold `vite build` spawns esbuild with one worker per core (8) plus rollup+gzip
= an all-core spike. The main culprits:

0. **Plain `vite build` / `npm run build`** - the spike itself. Always build via
   `bash scripts/safe-build.sh`, which runs the build under `nice`/`ionice` and
   pins it to half the cores with `taskset` so the heartbeat keeps a core. Never
   call `npm run build` directly.
1. **Playwright Chrome + vite build simultaneously** - the worst case (this
   combination caused the most recent crash). Never build while a Playwright
   browser is open. Always `mcp__playwright__browser_close` before building.
2. **Long-running Playwright sessions** - Chrome accumulates memory. Close the
   browser (`mcp__playwright__browser_close`) as soon as testing is done. Do not
   leave a browser tab open between tool calls.
3. **Large snapshots** - `mcp__playwright__browser_snapshot` on complex pages
   returns huge YAML. Prefer `mcp__playwright__browser_take_screenshot` for
   visual checks; only snapshot when you need element refs.
4. **Build order** - always build the frontend before starting the server:
   `bash scripts/safe-build.sh`, then `bash start.sh`. Never build and serve in
   the same shell invocation under load.
5. **Rebuild churn** - don't rebuild after every one-line change. Batch your
   frontend edits, then run a single throttled build. Each cold build is a
   spike; fewer builds = fewer chances to tip over.
6. **Lingering reconnect helpers (feedback loop)** - every reconnect leaves a
   `vscode-remote-containers-server-*.js` node helper behind that is never
   reaped (we have seen 12+ accumulate, ~1900 threads). Each carries file
   watchers, so every `dist/` rewrite fans out more watch events → higher
   baseline load → the next spike tips over more easily. To clear them, do a
   full **Reload Window** in VS Code (reaps stale helpers); they cannot be
   safely killed from inside the container without risking the active session.

**Diagnosing a crash (it's reconnect, not OOM):**

```bash
free -h                       # expect lots free - if so it is NOT memory
cat /sys/fs/cgroup/cpu.max    # "max ..." = no CPU cap (spike contention, not quota)
cat /proc/loadavg             # load vs nproc; transient spikes during build/Chrome
ps aux | grep -c "[v]scode-remote-containers-server"   # count of lingering helpers
curl -sf localhost:3001/api/health   # server.js survived → it was a reconnect
```

Host-side (user action, not changeable from inside): the container already has 8
cores / 31Gi and no cap, so raising Docker Desktop limits won't help - the issue
is _burst contention_, which the throttled build addresses.

**Safe Playwright workflow:**

```
1. Build first if needed (bash scripts/safe-build.sh), then start server
2. Open browser → take screenshots → close browser immediately
3. Make code changes
4. Rebuild with the throttled wrapper (browser MUST be closed)
5. Restart server
6. Re-open browser → verify → close
```

## Current TODO (todo.md summary)

**Done (sessions 1–8):** items #1–#13, #18–#39, #41 complete. See todo.md for
the full list. Session 8 added: unified describe/yaml/json inspect modal (#37) +
format-aware copy (#39), combined helm Values USER/ALL view with fixed yaml
tabbing (#36), port-forward via Shift+F (#38), and workload status that reflects
unhealthy owned pods (#41).

**Session 10:** #61 - replaced the hand-rolled edit-mode vim with CodeMirror 6 +
`@replit/codemirror-vim` (full vim: counts, text objects, change ops, f/t,
u/Ctrl-r, `.`, macros, ex commands). Added VimEditor.jsx + VimHelpOverlay.jsx
(`?`), deleted lib/vim.js. yaml/json syntax highlighting in the editor lands #62
partially (read views still custom).

**Session 15:** #56/#65/#68/#69 (polish). Helm-history is j/k-navigable, `v`
peeks the selected revision's values; the peek has a USER/ALL footer toggle +
`Tab`. Edit-apply errors render in a scrollable/dismissible red banner above the
footer (full multi-line kubectl msg) instead of being crammed into the footer.
Main top bar + inspect/helm read-view modals now have an always-visible
top-right search box (`/` focuses); the bottom-bar filter morph/pinned pill and
the modal's inline bottom search bar were removed. Namespace colors are a stable
name-hash (`getNsColor(ns)`); sidebar color = resource category (one accent per
section).

**Session 16:** #70/#71. The top-right search box is now dual-mode with a
`/`|`:` toggle: `/` = string filter, `:` = resource picker (folds in the old
bottom-left command bar). Resource mode shows a dropdown of all resources with
**alias-aware** autocomplete (typing "svc"→Services), Tab cycle, Enter/click
select. Store: `filterMode` ('str'|'res') + `submitCommand(raw)` returns
success; useKeys `:`/`/` set the mode and yield to the box while focused. #71
contrast pass: the dim blue-gray TEXT tiers
(#3a6070/#3a5a7a/#3a6a8a/#2a4a6a/etc.) were bumped brighter app-wide and the
base bg lifted #020818→#0a1220 (was dark-on-dark). A full theme system / light
mode is still #14.

**Session 17:** #14 - theme system. Migrated the **entire app off inline hex**
to semantic `var(--mz-*)` tokens defined in new `client/src/theme.js` (387 hex +
138 rgba triplets + 3 8-digit literals → tokens; `${color}+alpha` concat →
`alpha()`/`color-mix`). Two themes: "Mezzanine Neon" + "DevOps Building Blocks"
(brand red/yellow/blue on navy). ThemePicker (Shift+T / `:theme`) with j/k
live-preview + localStorage persistence. See the **Theming** section above. This
is now the home for #71's deeper contrast/light-mode work too.

**Session 18:** #53 - port-forward tracking table. A dedicated k9s-style **Port
Forwards** view (`:pf`, under NETWORK in the sidebar) lists every active forward
as a normal resource list (RESOURCE/LOCAL/REMOTE/STATUS/ERROR columns, live
count). Server folds active forwards into the standard data stream
(`latest.portforwards`, injected in `refresh()`/`/api/data`/WS init via
`pfList()`; `pfPublic` normalizes the `_` cluster-scoped namespace to ''), so
the table auto-refreshes like everything else. Stopping is non-destructive so
ctrl+d/ctrl+k and the `a`-palette "Stop forward" all run
`stopSelectedForwards()` (DELETE `/api/port-forward/:id`

- optimistic removal, multi-select aware) with no confirm dialog - `isStd` in
  actions.js now excludes `portforwards` so it gets no kubectl
  describe/yaml/edit/delete. In the Shift+F modal, Tab off the last port chip
  wraps to the LOCAL input (and Shift+Tab from LOCAL back to it).

**Session 20:** #81 - shell into a pod (`s`, k9s-style). New `/ws/exec`
WebSocket endpoint bridges `@kubernetes/client-node`'s `Exec` (its own socket to
the apiserver's pod/exec subresource) to a browser xterm: binary frames carry
stdin/stdout bytes, text frames carry JSON control (`resize` in;
`ready`/`error`/`exit` out). `getExec()` added to k8s.js. The WS server now
branches on `req.url` (`/ws/exec` = shell session, else data-stream subscriber).
Frontend: `ExecModal.jsx` (xterm + FitAddon, shell switcher sh/bash/zsh/ash that
reconnects, green/amber/red status dot, × to close - Esc belongs to the terminal
so useKeys early-returns while `execModal` is open). Registered as ONE `shell`
action in actions.js (pods + the container drilldown rows), so it appears as a
panel chip + in the `a` palette automatically. Live cluster only (rejects in
demo mode). Resize is wired via the stdout stream's rows/columns + a `resize`
event (client-node's `isResizable` detection). Next: #82 debug.

**Session 24:** #94 (RBAC, part 1 of 2). k9s-style **policy / rules view**:
`Enter` (or `p`) on a Role / ClusterRole / RoleBinding / ClusterRoleBinding /
ServiceAccount opens a `POLICY` modal - a rules table (API-GROUP · RESOURCE ·
NAMES · VERBS) with verb chips colored by severity (read=green, write=orange,
`*`=red), `/`-filterable, `j/k` scroll, Copy. Backend `fetchPolicy()` (k8s.js)
resolves rules read-only from the rbac.\* objects: a role returns its own
`.rules`; a binding returns subjects + the resolved roleRef's rules; a
**ServiceAccount aggregates** the rules from every Role/ClusterRoleBinding that
names it as a subject (`aggregationRule` detected). Plus a **can-i "whoami"**
view (`:whoami`/`:can-i`, or the new "Access Review" sidebar entry under RBAC):
`whoAmI()` runs SelfSubjectRulesReview (= `kubectl auth can-i --list`) for the
active namespace + SelfSubjectReview for identity, rendered as an identity
card + the same rules table + non-resource URLs. New endpoints
`/api/rbac/policy/:kind/:ns/:name` + `/api/rbac/can-i`; new `PolicyView.jsx`
rendered inside ActionModal (modal type `policy`); ONE `policy` registry entry
in actions.js. Demo mode has `getMockPolicy`/`getMockWhoAmI`. **Part 2 (app auth
mechanism) was explicitly deferred** per discussion - see #94's auth questions;
the build covers RBAC only.

**Session 27:** #108 - kubectl cp file copy (`Shift+C` on a pod / container).
New `CopyModal.jsx` with a container picker (pods with >1 container) + two
forms: DOWNLOAD (path in the container -> browser) and UPLOAD (browser file ->
container dir). The "local" side is the BROWSER, not the server fs: download
fetches the endpoint and triggers a blob download; upload POSTs the File's raw
bytes. Backend reuses the real `kubectl cp` (execFile, no shell) staging bytes
in a per-request `mkdtemp` (always cleaned up): `GET /api/cp/:ns/:pod/:container`
copies out then streams a single file as itself or a directory as `<base>.tar`;
`POST /api/cp/:ns/:pod/:container?path=&name=` (express.raw octet-stream) stages
the upload then cp's it in. Path safety: `validId` on ns/pod/container,
`validPath` (no control chars, no leading `-`) on the container path, `safeBase`
strips traversal from the uploaded filename. Live cluster only (kubectl cp execs
`tar` in the target, so the image needs tar). ONE `copy` actions.js entry (panel
chip + `a` palette + `Shift+C`); useKeys yields to the dialog like exec/debug.

**Remaining:**

- #15 In-cluster deploy
- #16 Multi-cluster support
- #17 Single binary packaging
- #46 Faster auto-refresh
- #62 syntax highlighting in read views (editor done)
- #78 BYOA / self-hosted AI agent (discussion pending)
- #84 vscode extension (discussion pending)
- #94 part 2: app-level auth mechanism (deferred - proxy-first vs built-in
  OIDC/impersonation)
- #14/#71 follow-ups: a light theme + a custom/user-defined color editor are now
  one `THEMES` entry away (deeper contrast tuning lives here)

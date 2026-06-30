#TODO

1. [x] make the sidebar categories collapsible accordians
2. [x] persistent volumes are incorrectly called "Perm Vols"
3. [x] Things under helm need to be treated differently... for example, we need
       the ability to view and search user values, all/computed values, see
       release history, rollback, see templates, etc
4. [x] Need the ability to mark multiple objects (in k9s this is done with
       space)
5. [x] need the ability to delete objects (in k9s this is done with ctrl+d ->
       shows a confirmation or ctrl+k -> just kills with no confirmation)
6. [x] As I select objects the logs/describe/yaml/edit buttons aren't all on a
       single row (i.e. the describe wraps to a new row)
7. [x] the edit mode kind of has an interior container for editing and the vim
       keybindings, search, etc don't work within it
8. [x] I like the side drawer that pops open for the selected objects, but I
       don't like that it covers the columns on the right even if the drawer
       does show that information... can we discuss alternative ideas?
       Additionally the top of the drawer is hidden under the object table
       header (status, ready, up to date, etc)
9. [x] I'd like a way to navigate up and down on the sidebar... maybe ctrl j/k?
10. [x] the breadcrumb view in the top header is a little hard to parse with
        the > and -> stuff maybe rethink that a bit
11. [x] can we add a secret decoding mode to the secrets and an ability to edit
        the secret such that when we edit it can be in a decoded state if we
        want?
12. [x] The copy capability in the different views is nice, but I'd like to
        think it through a little more with the ability to copy snippets, etc.
        maybe give it a hotkey? also give it some feedback when you click it?
13. [x] Let's do another pass on contrast as well, it's still a little hard to
        tell certain things like the object table header.
14. [x] Can we support the ability to do a custom theme and company branding? I
        like the current theme, but I'd also like to experiment with my github
        org red/yellow/blue colors which you can see here
        https://devopsbuildingblocks.com/ (done: new client/src/theme.js is the
        single source of truth — semantic tokens (bg/text tiers/accent/status/ns
        palette) per theme, written to :root as --mz-_ CSS vars + --mz-_-rgb
        triplets by applyTheme(). The whole app was migrated off inline hex
        literals to var(--mz-\*) (387 hex + 138 rgba triplets + 3 8-digit), so a
        theme switch repaints with no React re-render; only
        statusColor/getNsColor stay JS (theme-aware via ACTIVE) for
        ${color}+alpha math, and that alpha math moved to a color-mix() alpha()
        helper. Two built-in themes: "Mezzanine Neon" (original) and "DevOps
        Building Blocks" (brand red #E03B2A / yellow #F5C518 / blue
        #2B5AB7-#6da4f8 on dark navy, scraped from the site CSS). ThemePicker
        (Shift+T or :theme) — j/k LIVE-PREVIEWS each theme, Enter applies, Esc
        reverts; choice persists in localStorage. Adding a theme = one THEMES
        entry. This is also the home for the deeper contrast/light-mode work
        (#71).)
15. [x] I know this is currently working by detecting kubeconfigs, but can it
        also work by deploying to a k8s cluster? (chart added at
        charts/mezzanine: Deployment/Service/SA + ClusterRole+binding
        (rbac.readOnly toggle), optional Ingress, demo.enabled, in-cluster SA
        auth for both the k8s client and kubectl/helm shell-outs. Verified live
        on kind with published image ghcr.io/j2udev/mezzanine:0.1.0-snapshot:
        pod connects via in-cluster SA (demoMode:false), /api/data lists all 6
        ns / 10 pods / nodes / secrets cluster-wide, write RBAC
        (delete/patch/pods/portforward) granted, and the UI renders end-to-end
        through a port-forward.)
16. [ ] Can we support multiple k8s clusters similar to how you can select
        different clusters in lens or rancher.
17. [x] Can we package this is a single binary so it's very portable and easy to
        install? The juice may not be worth the squeeze here as this isn't a cli
        and more a web app... maybe this is still useful but at the least I need
        that ability to easily run this locally or in a k8s cluster, etc
18. [x] It's a little hard to tell the sidebar categories from the actual
        resources currently... also are we supporting custom resources /
        definitions?
19. [x] Looks like there are multiple copy button/instructions at the bottom of
        the various log/describe/yaml/etc windows
20. [x] Fix the edit mode search/filter bug where it stops capturing input after
        1 character
21. [x] The sidebar navigation is still not working and I'd like it to use ctrl
        j/k (override browser shortcuts)
22. [x] Make the sidebar collapsible and remove sidebar ctrl j/k navigation and
        bring back the ctrl-k kill shortcut
23. [x] After deleting an object, don't have any modal that sits there and waits
24. [x] It looks like we are still missing k8s resources... look up k8s docs and
        figure out what we are missing
25. [x] Multi-delete: when items are marked with Space, ctrl+k should kill all
        marked items in parallel and ctrl+d should show a confirmation listing
        the N objects before deleting them all
26. [x] When the scroll with j/k wraps around the top item in the table is under
        the table header
27. [x] Editing objects needs work. There needs to be search highlighting and
        having toggleable line numbers would be helpful (for edit and yaml)
28. [x] When marking objects, don't jump to the next item in the list
29. [x] Searching in the yaml view works and highlights, but it makes the
        background text in the row highlight (see yaml-search-highlight.png)
30. [x] collapse yaml view and edit into a single modal where yaml is the
        default and "i" drops you into edit mode. Add the ability to toggle
        between yaml and json
31. [x] gg and G should work as navigation in the object table as well
32. [x] put the shortcuts in the bottom into a dedicated modal that you activate
        with a "?"
33. [x] add column sorting using k9s shortcuts see k9s-shortcuts.png
        (Shift+N/A/S = name/age/status, repeat toggles dir; removed n/N ns
        cycling)
34. [x] add filtering by status using k9s shortcuts see k9s-shortcuts.png (done
        as Shift+S sort-by-status + ctrl+z toggle-faults, per follow-up)
35. [x] the yaml/json tabbing is not right in the yaml/json view
36. [x] the helm setup needs some tlc... see cramped-helm-buttons.png. the
        values and all values should just be combined into a single view that
        can toggle between all values and user values... additionally the values
        appear to be missing the tabbing for the yaml (done: single Values modal
        with USER/ALL footer toggle; helm yaml now rendered via shared
        ContentLines so indentation/line-numbers match)
37. [x] the yaml button when highlighting an object should either have an
        indication that you can also toggle json or should be given a more
        generic name... maybe we combine describe/yaml/json and allow a shortcut
        to toggle between the different views (done: describe/yaml/edit open one
        unified modal with a DESCRIBE/YAML/JSON footer toggle + Tab/Shift+Tab to
        cycle; describe folded in)
38. [x] Add the ability to port-forward (shift f) (done: PortForwardModal via
        Shift+F for pods/services/deployments/ statefulsets; backend
        start/list/stop kubectl port-forwards, demo sim)
39. [x] the copy functionality doesn't respect json toggle and always copies
        yaml (done: copy now uses the on-screen view — describe/yaml/json/edit)
40. [x] better vim keybind support in edit mode (visual mode, yank, delete, :wq,
        etc) and when filtering, the cursor doesn't actually go to where the
        highlighted string is. the non vim mode should still have (done with
        #55: client/src/lib/vim.js pure motions/operators — hjkl/w/b/0/^/$/gg/G,
        i/a/I/A/o/O, x/dd/D, yy + visual y/d, p/P, v visual mode, : command line
        w/wq/x/q/q!. Search now moves the REAL cursor to the match and it stays
        there after clearing (Esc closes search first, returns focus). VIM
        toggle off = plain textarea with native caret.)
41. [x] when a deployment has an issue (like a bad image tag for examle), it's
        status/color doesn't reflect that it has a pod having issues (done:
        kubectl-style pod statuses + applyWorkloadHealth marks a workload
        Degraded when an owned pod is unhealthy even at full replica count)
42. [x] Rename the project to kHUD (wordmark, loading screen, page title)
43. [x] I think we need a better way of presenting actions on an object for
        users that don't use the shortcuts and click. Currenty there are just 4
        buttons (give or take depending on what object you're looking at) in the
        drawer and if we ever need to add anything we start to see ux issues
        (like with the helm buttons for example) We need some sort of "button
        scalable" way to add additional object interaction capability (done: new
        client/src/actions.js registry is the single source of truth for
        per-object actions {label, hint, color, group, when, key, run}. Detail
        panel renders applicable non-danger actions as wrapping chips + an "a ⋯"
        palette button; new ActionMenu (a) shows ALL applicable actions grouped
        & filterable; useKeys dispatches keyed actions via the registry. Adding
        a future action = one registry entry — appears in panel, palette, and as
        a shortcut automatically.)
44. [x] Add the ability to jump to owner (shift j) (done: backend resolves owner
        jump targets for pods/replicasets/jobs; Shift+J pushes a nav frame and
        selects the owning controller)
45. [x] editor search is very buggy and sometimes the highlighted term is off
        the screen, sometimes the highlight lags behind when I scroll through,
        etc... give it a pass and make sure it's functioning as intended (done:
        edit-search scroll now measures the current match mark element's
        offsetTop instead of line\*lineHeight, so wrapped lines no longer push
        the match off screen)
46. [x] the dashboard doesn't seem to refresh very quickly... for example after
        fixing a degraded deployment, the terminating pod stuck around until I
        refreshed
47. [x] After doing a search within yaml, describe, edit, etc if you remove the
        filter the cursor should stay on the last highlighted item you jumped
        to... currently it jumps back to the top of the screen (done: scroll-to-
        match effect now guards on an active search, so clearing the filter no
        longer fires with stale match refs and the view stays put)
48. [x] Helm still needs some tlc. It needs shortcuts for the various screens (v
        for values and tab to toggle between user/all within the values modal, h
        for history, n for notes, t for templates and m for manifests where the
        templates and manifests share the same modal and you can toggle between
        them with tab, need the ability to select a release from history and
        rollback or check values of a release of the given selected item from
        history) (done: v/m/n/h/d shortcuts + DetailPanel keys + HUD/help hints;
        Tab toggles USER/ALL in the values modal; history rows have a Values
        button that peeks that revision's user values via ?revision=, plus the
        existing Rollback. Templates dropped per decision — no real Helm "get
        templates" for an installed release; m opens the manifest)
49. [x] secret decoding needs a shortcut (x like k9s) that we use as a toggle
        with the modal and as a direct jump into the modal with secrets decoded
        from the table row (done: x on a selected secret opens the inspect modal
        in YAML pre-decoded; x inside the modal toggles decode/re-encode)
50. [x] port forwarding should have a suggestion for the port based on what
        ports are seen on the object you're port-forwarding. svc port forwarding
        seems mostly fine, but pods is not as I would expect (done: backend adds
        containerPorts to pods/deployments/statefulsets; PortForwardModal shows
        clickable port chips and prefills from the object's ports)
51. [x] when I filter for a resource I should see an indication somewhere front
        and center what I'm looking at... there is lots of real estate in the
        header (done: top bar now shows a front-and-center resource indicator —
        capitalized resource name + count + active "/<filter>" chip — when not
        in a drilldown breadcrumb)
52. [x] for secret decoding, if I'm on the json view and i press decode, it
        should not jump me back to yaml (done: added transformSecretJsonData so
        the `data` block decodes in place on JSON; x only snaps DESCRIBE→YAML
        since describe has no decodable data block; Decode button now shows on
        JSON view too)
53. [x] the current port-forwarding setup is pretty good, but we need a way to
        keep track of what port forwards are active so we don't leave them
        hanging maybe a dedicated port forwards table or something (like k9s).
        Additionally when tabbing through ports when you get to the end of the
        list, it should wrap around to the local/remote input boxes (done:
        dedicated "Port Forwards" view — a k9s-style `:pf` table under NETWORK
        in the sidebar listing every active forward
        (resource/local/remote/status/ error) with live counts. Active forwards
        now ride the normal data stream (server injects `portforwards` into
        `/api/data`+WS), so the table auto- refreshes. ctrl+d/ctrl+k (and the
        `a` palette "Stop forward") stop the selected/multi-selected forward(s)
        via stopSelectedForwards() — no confirm since stopping is
        non-destructive. In the Shift+F modal, Tab off the last port chip wraps
        to the LOCAL input and Shift+Tab from LOCAL wraps back to the last
        chip.)
54. [x] when in the yaml/json view of a resource, going to edit mode should be
        "e" and then to enter insert mode is "i" (done: `e` from any read view
        enters edit mode forcing YAML; `i` now only enters INSERT from edit
        NORMAL; footer/help/CLAUDE.md hints updated)
55. [x] There still isn't a visible cursor in the edit window... j and k are
        just scrolling the window they aren't actually tracking a cursor which
        means when I search for a term/etc, there is no cursor that actually
        takes me to the word (done: edit textarea stays focused in
        NORMAL/VISUAL; the cursor is a real block cursor rendered as a 1-char
        selection (native thin caret hidden), tracked by editCursor. j/k/h/l and
        all motions move it; click repositions it; search jumps it to the match.
        See #40.)
56. [x] Within the helm history modal/table there needs to be a shortcut "v" to
        check values and within values we need the same tab toggle between user
        values and all values (done: history table is now j/k-navigable with a
        highlighted row; `v` peeks the selected revision's values; in the peek a
        USER/ALL footer toggle + Tab re-fetches via ?revision=&all=true)
57. [x] within edit screens, default to line numbers on (done: showLineNumbers
        initialized true when modal opens in edit, and set true when entering
        edit via `e`)
58. [x] the actions are great, but I the search bar shouldn't be
        autohighlighted... you should have to focus it with a forward slash like
        we do elsewhere. by default it should just scroll up and down with j/k
        and you should be able to hit enter on a selected item or just hit its
        shortcut straight from the menu
59. [x] fix multicontainer log issue you found: One thing I noticed while
        testing (not in scope, pre-existing): fetching logs on a multi-container
        pod with "all containers" selected returns a 400 — you have to pick a
        container from the dropdown. (done: /api/logs/:ns/:pod with no container
        now reads the pod spec; for multi-container pods it fetches each
        container's logs in parallel and combines them with [container] prefixes
        instead of letting the k8s API 400)
60. [x] When filtering for a resource I want tab to autocomplete/cycle through
        potential options
61. [x] The vim mode editing is still lacking a lot of shortcuts... just as a
        quick example there is no undo/redo, no delete h/l, no jumping to a line
        number with g, or end of line with g\_, or change in word ciw, etc... it
        doesn't need absolutely everything but it should be a rich feature
        set... additionally the shorcut list at the bottom of the edit modal
        when in vim mode is getting out of hand... maybe a separate "?" that
        shows vim shortcuts in a separate window or something. Before you get
        started on this lets talk about it... I want to understand if what I'm
        asking for is a little heavy handed... effectively reinventing vim for
        the browser and if so if maybe something already exists. (done:
        discussed build-vs-buy and chose CodeMirror 6 + @replit/codemirror-vim
        over hand-rolling. VimEditor.jsx wraps an EditorView that owns the
        buffer and full vim engine — counts, operator+motion, text objects
        (ciw/diw/ci"), f/F/t/T/;/,, u/Ctrl-r, . repeat, registers, q macros, ex
        commands. The ActionModal key handler now yields entirely to CodeMirror
        in edit mode; :w/:wq/:q wired via Vim.defineEx; overflowing footer hints
        replaced by a ? cheatsheet (VimHelpOverlay). lib/vim.js + bespoke cursor
        plumbing deleted.)
62. [~] it would be nice if the edit mode had some syntax highlighting (we are
    only dealing with yaml and json so shouldn't be overly difficult) (edit mode
    done for free via CodeMirror lang-yaml/lang-json as part of #61; read views
    (describe/yaml/json) still use the custom ContentLines highlighter — left
    as-is per the edit-mode-only scope)
63. [x] there are some incorrect shortcut hints at the bottom of the edit modal
        (remove :wq and :q)... we only want the "?" when vim mode is toggled
        (done: removed the :wq/:q footer VimHints; the "? vim keys" hint already
        gated on editVimMode, so edit mode now shows no ex-command hints and
        only surfaces "?" when VIM is toggled on)
64. [x] Keyboard shortcut modals should be scrollable with j/k and should have
        filter support (/ to trigger it like in other views but also a clickable
        search bar in the header of the modal) (done: HelpModal now flattens its
        sections into a filterable/navigable list — clickable search bar in the
        header, `/` focuses it (matches the rest of the app), j/k move a
        highlighted selection with scrollIntoView, esc blurs the filter then
        closes. Mirrors the ActionMenu (#58) pattern. The VimHelpOverlay
        cheatsheet is intentionally left as a plain reference — it renders over
        the CodeMirror editor where `/`, `j`/`k` are live vim commands, so a
        filter there would conflict.)
65. [x] when we edit and an error is thrown, we need a more elegant way to
        capture the error message (see bad-error-ux.png) (done: apply errors now
        render in a dedicated, scrollable, dismissible red banner above the
        footer — full multi-line kubectl message wrapped, with Copy + × dismiss;
        the footer just shows "✗ apply failed — see details ↑")
66. [x] /currently objects are grouped by namespace, but by default I'd rather
        that be opt in with a toggle. By default it should just be a flat list
        like in k9s where the namespace is just another column (done: new
        groupByNamespace store flag defaults false → flat list with a colored
        NAMESPACE column (shown when viewing all namespaces). ctrl+g toggles
        grouped headers; top-bar pill (flat ⇄ grouped) mirrors/toggles state.
        arrangeForDisplay now threads groupByNamespace so j/k nav order stays in
        lockstep with the display.)
67. [x] age should be a column on every resource type (I think... if there is an
        edge case i'm not thinking about tell me) (done: AGE is now a column on
        every resource type — added to k8s.js real-fetch + mock.js demo data
        (mock fills any row missing age with a deterministic plausible value),
        and to COL_HEADERS/COL_WIDTHS + ResourceRow rowFields. AGE is the
        right-aligned trailing column everywhere; previously-trailing columns
        un-right-aligned to make room. Edge case: the synthetic "containers"
        drilldown has no age of its own — a container shares its pod's age and
        isn't a real k8s object — so it's intentionally left without an AGE
        column.)
68. [x] filter on the main view should have a search bar in the top right of the
        header and "/" should drop you into it. likewise in describe/yaml/json
        there should be a search in the top right that you focus with "/" (done:
        always-visible search box top-right of the main top bar (`/` focuses,
        shows count + ×); the bottom-bar filter morph + pinned pill were removed
        as redundant. The inspect/helm read-view modals get a matching top-right
        search box in the header (`/` focuses, shows match count); the old
        inline bottom search bar was removed. Logs keep their own grep control.)
69. [x] is the color coding random? For example the namespaces all get different
        colors and when clicking things in the sidebar they are highlighted in
        random colors. (done: it wasn't random but it was unstable/arbitrary.
        Namespace colors are now a stable hash of the namespace name — a given
        ns always gets the same hue regardless of which others are present (was
        positional sorted-index, so colors shifted as the set changed). Sidebar:
        one accent color per section (color now encodes resource _category_)
        instead of seemingly-random per-item colors.)
70. [x] The filter search bar in the top right should also support the resource
        filter so "/" or ":" (currently ":" is still at the bottom left) give
        the search box a toggle attached to it for resource filtering vs string
        filtering for users that don't want to user shortcuts. If the resource
        filter is toggled on, you should have that autocomplete functionality
        but it should also turn into a dropdown of all the available options.
        (done: the top-right box now has a `/`|`:` mode toggle (str filter vs
        resource picker). `/` focuses string mode, `:` focuses resource mode and
        replaces the old bottom-left command bar. Resource mode shows a dropdown
        of all resources with alias-aware autocomplete (typing "svc"→Services),
        Tab cycles, Enter/click selects. store `filterMode` +
        `submitCommand(raw)` returning success; useKeys `:`/`/` set the mode.)
71. [x] I like the colors of the app, but when I opened it on my main monitor it
        was very dark and the contrast was really bad even when I had brightness
        maxxed. Can you do a contrast pass? Perhaps we can explore the custom
        theming task for this to test various contrasts. (first pass done: the
        problem was dim blue-gray TEXT (#3a6070/#3a5a7a/#3a6a8a/#2a4a6a tiers)
        on a near-black bg — bumped those text tiers brighter app-wide (191
        repl.) and lifted the base bg #020818→#0a1220 + panels. Left ~ open: a
        proper theme system / light mode lives in #14, which is the right home
        for "test various contrasts".)
72. [x] The bottom status bar that shows the shortcuts is too crowded. We only
        need the bare minimum (j/k, :, /, all else in ?) (done: bottom bar now
        shows only j/k select, : resource, / filter, ? help — the per-context
        hint blocks (enter/back/fwd, helm v/m/n/h, mark/l/d/y/e/x/fwd/owner/a/
        ctrl+d/ctrl+k, Esc) were removed since those live in the ? help modal
        and the detail-panel action chips. State pills (N marked, sort,
        faults-only) stay as they're status/clear-affordances, not shortcut
        spam. Dropped now- unused DRILLABLE/FORWARDABLE/OWNED imports from HUD.)
73. [x] The currently selected resource type should be more centered in the
        header instead of pushed up against mezza9 (done: the resource indicator
        and breadcrumb now render in an absolutely-centered slot in the top bar
        (left:50% / translateX(-50%), maxWidth 40%, pointer-events pass-through)
        so "Pods 10" reads as front-and-center instead of left-pinned next to
        the mezza9 wordmark.)
74. [x] The shortcuts modal on the main screen shouldn't cycle through ever
        item, it just needs to scroll the modal (done: HelpModal j/k now scroll
        the modal body (ctrl+d/u half-page, g/G top/bottom) instead of moving a
        highlighted selection cursor; the per-item highlight/idx nav from #64
        was removed. Filter (/) still works.)
75. [x] Remove any emdashes and add a note in CLAUDE.md about not using it
        (done: swept all em dashes (—) out of src + client/src (49) and
        CLAUDE.md (53), replacing " — " with " - " and the empty-value
        placeholder with "-". Added a "Writing Conventions" note at the top of
        CLAUDE.md forbidding em dashes in code/comments/UI/commits/docs.)
76. [x] the helm history values view doesn't have a filter to search values (the
        main helm values view does) (done: the history values peek now reuses
        the read-view search plumbing - top-right "/" search box + n/N match
        nav + highlighting - by routing contentLines/match indices to the peeked
        revision's values when peeking. Search clears on enter/leave of the
        peek.)
77. [x] The resource filter should complete to the shortest and most sane item
        first... for example when I do ":po" it should not default to pdb and
        instead should be "pod" (done: resource-picker ranking now scores each
        option by [tier, shortest-matching-alias-length] where tier is exact <
        prefix < substring. ":po" → Pods (via "pod"/3) ranks above Pdb (via
        "poddisruptionbudget"/19); ":pod"/":pdb" hit their exact aliases first.)
78. [ ] I want to discuss plans for a "BYOA" bring your own ai agent setup or we
        can discuss options for self hosting if it's free... I've seen a couple
        of k8s dashboards popping up that have built in ai capability and I'd
        like to understand what is in the realm of possiblity here. I'm
        imagining like an ai modal that acts like a simpler version of claude
        code where the ai agent is a k8s expert
79. [x] history (navigating with ] and [) doesn't appear to work in many cases;
        verify (done: root cause - history only tracked drilldowns/owner-jumps;
        plain resource switches (sidebar click, ":" picker, CRD open) WIPED
        navStack, so "[" did nothing after switching resources. Now every
        resource switch pushes a navFrame (browser-style), so [/] step across
        resource switches AND drilldowns. Refactored the duplicated frame
        literals in drillDown/navBack/navForwardStep/jumpToOwner to one
        navFrame() helper. Verified [/] both directions in the live cluster.)
80. [x] Add the ability to check logs for a specific container under a pod if I
        drop into the pod to see the containers (done: 'containers' added to the
        LOGS action set so "l" works on a pod-drilldown container row; fetchLogs
        special-cases the container case - pod = item.pod, container =
        item.name - so it tails just that container. Verified live.)
81. [x] Would it be possible to exec into a container/pod using an optional
        sh/bash/zsh? K9s calls this "shell" and the shortcut is "s" (done: `s`
        opens ExecModal, an xterm terminal wired to a new /ws/exec WebSocket
        that bridges @kubernetes/client-node's Exec to the apiserver. Works on a
        pod (first container) and on a single container from the pod drilldown.
        Header shell switcher sh/bash/zsh/ash reconnects with the chosen shell.
        Binary frames = stdin/stdout, text frames = JSON control
        (resize/ready/error/exit). Live cluster only. Verified live against the
        kind cluster - typed into kindnet's busybox shell and got output.)
82. [x] Would it be possible to add a "debug" into a pod similar to kubectl
        debug? (Shift+D on a pod/container opens a DebugModal: pick a debug
        image - busybox/netshoot/alpine/ubuntu or free text - plus the target
        container to share the process namespace with. POST /api/debug/:ns/:pod
        injects an ephemeral container via addEphemeralDebugContainer() in
        k8s.js, waits for it to be Running, then hands off to the normal shell
        terminal bound to that container. Lets you debug distroless/no-shell
        pods with real tooling. Registered as one 'debug' entry in actions.js.
        Verified end-to-end with a shell-less pause pod: ps in the debug shell
        saw PID 1 = pause.)
83. [x] The current themes are still not showing enough contrast. Especially the
        neon theme. The fonts should really pop in more of a neon fashion across
        the board and should maybe have slightly thicker brush strokes
        (Brightened the low-contrast text/accent tokens in theme.js for both
        themes - text-dim/text-faint/text-muted/text-mid/accent-2 all lifted,
        mezzanine accent bumped slightly too. Skipped the font-weight idea -
        Courier New only has normal/bold weights, so 500 wouldn't render
        differently. Verified visually via Playwright screenshot.)
84. [ ] Is there any possibility that this could be a vscode extension that can
        run in my editor?
85. [x] Cap the history tracker at like 5 resources shown. It should act like a
        carousel such that when you have greater than 5 items the beginning of
        the stack is pushed out of the ui element and replaced with a ...
86. [x] task 83 previously marked as complete but it didn't do nearly enough for
        the contrast... I want the fonts to pop in a more neon fashion. Similar
        to the mezza9 logo that is literally lit up. We don't need to go quite
        that far, but the fonts really need to pop more and the colors could be
        slightly less dark overall. The font thickness needs to be heavier too
87. [x] The mezzanine logo in the top left needs to be a little larger
88. [x] we need a favicon for the mezza9 logo
89. [x] we need a way to toggle the drawer that pops out from the right (i.e.
        just turn the feature on and off such that as I scroll it doesn't come
        back... it would give a lot more real estate)
90. [x] Let's add a "warp to namespace" feature like k9s and make it use the "w"
        key (done: `w` warps the view DIRECTLY to the selected resource's
        namespace (bypasses the picker) - same effect as clicking a namespace
        header in grouped mode via setActiveNamespace. Pressing `w` again while
        already scoped to that namespace toggles back to all-namespaces.
        Implemented as ONE actions.js registry entry (warp-ns, Navigate group,
        when = non-cluster-scoped resource), so it shows as a detail-panel
        chip + in the `a` palette + as the `w` shortcut automatically. Added to
        the ? help modal under NAVIGATION.)
91. [x] There is a bug with the namespace picker... if I pick a namespace it
        then filters out other namespaces in the namespace picker. The ns picker
        should be the exception to the filter. Additionally the random "SELECT
        NAMESPACE" in the top left seems out of place (done: cluster-scoped
        resources (namespaces/nodes/pvs/CRDs - anything with no namespace) are
        now exempt from the active-namespace scope in all three filter paths
        (store getFilteredItems via CLUSTER_SCOPED_RESOURCES, ResourceList + HUD
        count via "has any namespace" guard), so selecting a namespace no longer
        empties the picker/node/pv lists. The out-of-place top-left "SELECT
        NAMESPACE" pill was removed; it now renders front-and-center in the
        header's center slot (where the resource title normally sits) with an
        "Enter to warp · Esc to cancel" hint.)
92. [x] Add template(s) to the helm chart to support programmatically creating
        an istio virtualservice (and/or a delegate istio virtual service).
        (done: new charts/mezza9/templates/virtualservice.yaml gated on
        virtualService.enabled. Generates a route to the dashboard Service
        (<fullname>.<ns>.svc.cluster.local on service.port) with optional URI
        match + port override. virtualService.delegate=true renders a DELEGATE
        VS (omits hosts/gateways per Istio rules); virtualService.delegateTo
        {name,namespace} renders a ROOT VS whose route delegates instead of
        routing to the Service. Escape hatches: raw http (replaces generated
        route) + tls/tcp passthrough + exportTo + labels/annotations +
        apiVersion override (default networking.istio.io/v1). values.yaml
        block + README "Expose via Istio" section + NOTES.txt hint. Verified:
        helm lint, 6 render scenarios validated against the real Istio 1.24 v1
        VirtualService CRD schema offline.)
93. [x] Can you build a github cicd pipeline to publish amd64/arm64 container
        images and a helm chart oci image. (done: two GitHub Actions workflows.
        .github/workflows/release.yml (on v*.*.\* tag + workflow_dispatch)
        resolves ONE version (tag minus v / dispatch input / 0.0.0-edge.<sha>),
        builds+pushes a multi-arch linux/amd64+arm64 image to
        ghcr.io/<owner>/mezza9 via buildx/QEMU (the Dockerfile already keys
        kubectl/helm off TARGETARCH), then packages the chart with that same
        version (yq bakes image.repository/tag into values so a bare helm
        install pulls the matching image) and helm-pushes it to
        oci://ghcr.io/<owner>/charts/mezza9. Tags also get `latest`. The
        frontend is built on the runner first (npm run build -> client/dist)
        since the Dockerfile copies it. .github/workflows/ci.yml (PR + push
        main) validates without publishing: frontend build, helm lint + template
        (incl. the #92 VS in all 3 shapes), single-arch docker build smoke.
        Verified: actionlint clean on both, version-resolution logic across all
        triggers, and the full helm package path (version/appVersion override +
        image tag bake -> rendered image ghcr.io/j2udev/mezza9:1.2.3). Chart
        README updated to lead
94. [~] We need enhance rbac capabilities. Explore things like kubectl auth
    can-i and how k9s does things (you can hit enter on serviceaccounts,
    cluster/roles, cluster/rolebindings and see a dedicated rbac/policy view
    that shows what that resource can and can't do). I'd like to incorporate
    similar capability to mezza9. Additionally do you think we need the ability
    to put the app behind some kind of auth mechanism? And if so, how do we do
    that in a generic way? (RBAC part DONE; auth part DEFERRED per discussion.
    k9s-style policy view: Enter/`p` on a role / clusterrole /
    role&clusterrolebinding / serviceaccount opens a POLICY modal - a rules
    table (API-GROUP/RESOURCE/NAMES/VERBS) with verb chips colored by severity
    (read=green, write=orange, _=red), /-filterable, j/k scroll, Copy. Backend
    fetchPolicy() resolves rules read-only from the rbac._ objects: a role = its
    own rules; a binding = subjects + the resolved roleRef's rules; a
    ServiceAccount AGGREGATES the rules of every Role/ClusterRoleBinding that
    names it as a subject (aggregationRule detected). Plus a can-i "whoami"
    Access Review (:whoami / sidebar entry under RBAC) = SelfSubjectRulesReview
    (the kubectl auth can-i --list mechanism) + SelfSubjectReview for identity,
    shown as an identity card + rules table + non-resource URLs. New
    PolicyView.jsx + ONE actions.js registry entry + endpoints
    /api/rbac/policy + /api/rbac/can-i; demo-mode mocks. Verified live on kind
    across all 5 RBAC kinds + whoami. AUTH part: chose to defer - locally no
    auth is fine (localhost == kubeconfig already); in-cluster the real risk is
    an unauthenticated Ingress inheriting the dashboard SA's RBAC, and the
    generic answer is to put it behind a proxy (oauth2-proxy / Istio
    RequestAuthentication) rather than build an IdP into the app, with built-in
    OIDC + impersonation as the heavier "correct" multi-user path - tracked as a
    separate follow-up.)
95. [x] can we move the drawer/wide and grouped/flat toggles to the bottom right
        instead of left? (done: the flat/grouped (toggleGroupByNamespace) and
        drawer/wide (togglePanel) toggles moved from the bottom-LEFT cluster in
        HUD.jsx to the bottom-RIGHT cluster, placed leftmost there ahead of the
        history controls + count. The bottom-left now shows only the bare
        shortcut hints (j/k select, : resource, / filter, ? help) plus the
        faults/sort state pills. Same markup/handlers/conditions (grouped toggle
        still gated on namespacedView), just relocated. Verified live: both
        toggles render bottom-right and still flip flat⇄grouped and
        drawer⇄wide.)

# ─────────────────────────────────────────────────────────────────────────────

# Session 25 review: security audit + dashboard gap analysis

# Each item below is scoped to stand alone in its own session. Security items

# #96-#103 should land before any public / networked release. #96 + #97 are DONE.

# (Frontend was checked for XSS / unsafe HTML / eval - clean, all cluster data is

# rendered as escaped text, no action needed.)

# ─────────────────────────────────────────────────────────────────────────────

## Security hardening

96. [x] Unauthenticated RCE via command injection in the kubectl/helm
        shell-outs. FIXED (session 25). src/server.js built kubectl/helm
        commands as shell strings (execAsync = exec → /bin/sh -c) interpolating
        URL params, so e.g. GET /api/describe/pods/default/x%3Btouch...%23 ran
        arbitrary host commands with NO auth (confirmed live, fixed, then
        re-verified blocked = 400). Converted all 9 sinks (describe / yaml /
        json / delete + helm values / manifest / notes / history / rollback) to
        execFileAsync (no shell, arg arrays) + a validId() allowlist
        (^[A-Za-z0-9][A-Za-z0-9._:-]\*$ - allows the '.' in grouped types and
        the ':' in system: RBAC names; '\_' ns sentinel handled by callers).
        Same no-shell pattern /api/edit + port-forward already use via spawn.
        See #99 for the endpoints that still need the validId guard.

97. [x] App authentication gate (RELEASE BLOCKER; this is #94 part 2, now
        elevated). DONE (session 26): implemented (b) the built-in shared-token
        gate + (a) the proxy/TLS docs; (c) OIDC + per-user impersonation stays
        deferred (next step). Server (src/server.js): MEZZ*TOKEN or
        MEZZ_TOKEN_FILE (mounted Secret) gates EVERY /api/* (except public
        /api/health) via middleware AND both WS upgrades (/ws + /ws/exec) via
        verifyClient. Token check is sha256 + timingSafeEqual (constant-time);
        accepted as Authorization: Bearer, HTTP Basic (token in password, falls
        back to username), or ?token= (browsers can't set WS headers). FAIL
        CLOSED: a configured-but-empty token (unreadable Secret / wrong key /
        blank) exits(1) instead of serving unauthenticated. Gate normalizes path
        case + percent-encoding (Express routes case-insensitively, so /API/data
        would otherwise bypass a case-sensitive prefix check - found + fixed in
        the adversarial review). /api/health reports authRequired; new gated
        /api/auth/verify; loud startup warning when no token set. Client:
        lib/auth.js (localStorage token, window.fetch wrapper adds Bearer +
        fires mezz-auth-required on 401, withToken() for WS URLs),
        LoginScreen.jsx, store initAuth(retry)/login/logout/requireReauth(any
        401 => login), useWS gated on authed + tokenized, useKeys yields to
        login, ExecModal tokenizes /ws/exec. Chart (charts/mezza9):
        auth.{token,existingSecret,secretKey} -> Secret mounted as
        MEZZ*TOKEN_FILE, with helm-time validation (blank token / bad secretKey
        fail the install). README "Security" section documents both paths.
        Files: src/server.js, client/*, charts/mezza9/\*, README.md. (k8s.js
        untouched - no per-user impersonation yet, that is the deferred (c).)

98. [ ] Default-bind loopback + lock down CORS + validate WebSocket Origin. (a)
        server.listen currently binds 0.0.0.0 - default to 127.0.0.1 with an env
        (MEZZ*HOST) to opt into a wider bind, and refuse a non-loopback bind
        unless auth (#97) is on. (b) app.use(cors()) returns
        Access-Control-Allow-Origin:* (confirmed live) - remove it or restrict
        to a configured origin; '\_' lets any website read responses (secret
        exfil). (c) WebSockets bypass CORS entirely - validate the Origin header
        in wss 'connection' for BOTH /ws and /ws/exec (cross-site WebSocket
        hijacking: any page can currently open a socket to localhost:3001 to
        stream cluster data or open a pod shell). Files: src/server.js. NOTE:
        #96 + #98 together close the "a malicious web page roots your
        laptop/cluster while you run mezz locally" drive-by.

99. [ ] Extend the validId() guard to the remaining request-param endpoints.
        These use the k8s client or spawn arg-arrays (so NOT shell-RCE), but
        unvalidated input still allows argument-injection (e.g. a value starting
        with '-') and confusing errors: POST
        /api/port-forward/:resource/:ns/:name (validTarget + port range
        1-65535), GET /api/exec/shells/:ns/:pod, the /ws/exec handler (validId
        ns/pod/container + allowlist the `shell` query param against
        SHELL_CANDIDATES), POST /api/debug/:ns/:pod (validId; consider
        restricting the debug image), GET /api/crd/:group/:version/:plural.
        Files: src/server.js.

100.    [ ] Harden the Helm chart for safe release. (a) values.yaml: default
            rbac.readOnly: TRUE (currently false = the wildcard _/_ write
            ClusterRole, i.e. effectively cluster-admin for a no-auth app). (b)
            Add an optional NetworkPolicy template (default-deny ingress /
            scoped egress to the apiserver) - new templates/networkpolicy.yaml +
            values toggle. (c) Add securityContext.seccompProfile:
            RuntimeDefault; consider readOnlyRootFilesystem: true with emptyDir
            mounts for /tmp and the kubectl/helm cache. (d) Add Pod Security
            Standards "restricted" guidance. Files: charts/mezza9/\*.

101.    [ ] TLS + exposure warnings in the chart docs (so nobody accidentally
            exposes an unauthenticated cluster-admin dashboard). NOTES.txt
            currently prints the Ingress / VirtualService / LoadBalancer URL
            with no security warning. Add a prominent warning to NOTES.txt +
            README that any external exposure REQUIRES auth (#97) + TLS, and
            that rbac.readOnly:false is cluster-admin. Document TLS termination
            at the ingress/proxy (optionally built-in HTTPS via cert paths).
            Files: charts/mezza9/templates/NOTES.txt, charts/mezza9/README.md.

102.    [ ] Operational safety in src/server.js. (a) Structured audit log of
            every mutating action (what / when / by-whom once #97 lands) -
            currently zero accountability. (b) Rate limiting (e.g.
            express-rate-limit) + a timeout on the /api/edit apply (the only
            shell-out with no timeout). (c) Stop returning raw kubectl/helm
            stderr to clients (leaks node names / secret refs) - log
            server-side, return a generic message. (d) Cap concurrent /ws data
            clients and /ws/exec sessions (both currently unbounded → DoS).

103.    [ ] CI/CD + image supply-chain hardening (lower urgency than #97-#102).
            (a) Dockerfile: verify kubectl/helm SHA256 checksums after download;
            pin node:22-slim by digest. (b) release.yml: provenance:true +
            publish an SBOM + sign image/chart (cosign); pass
            ${{ inputs.version }} via env and validate it against a SemVer regex
            (avoid run-step interpolation). (c) ci.yml: helm lint --strict.
            Files: Dockerfile, .github/workflows/\*.yml.

## Feature gaps vs other web dashboards (Lens / Headlamp / k8s-dashboard / k9s)

104. [ ] Metrics / resource usage - the biggest feature gap (peers all show it,
         mezz shows none). Integrate metrics-server (metrics.k8s.io via
         client-node) for pod + node CPU/memory (the `kubectl top` data); add
         usage columns to pod/node rows + a cluster-overview summary (CPU / mem
         / pod count / node-ready gauges). Optional Prometheus source later.
         Files: src/k8s.js + new /api/metrics in src/server.js, client columns +
         an overview view.

105. [ ] Workload lifecycle actions - none exist today (only delete/edit). Each
         is ONE client/src/actions.js OBJECT_ACTIONS entry + a store method + a
         kubectl/patch call (see "Object Actions" in CLAUDE.md): scale replicas
         (deployments/statefulsets/rs), rollout restart (patch a template
         annotation), node cordon/drain/uncordon, cronjob suspend/resume +
         trigger-now (create a Job from the cronjob). Keep server shell-outs on
         the execFileAsync no-shell pattern. Files: client/src/actions.js,
         store.js, src/server.js.

106. [ ] Create resources / apply-from-file. Today you can only EDIT existing
         objects. Reuse the existing apply path (POST /api/edit = kubectl apply
         -f -) to create NEW objects: a "new manifest" buffer (reuse VimEditor /
         ActionModal) + paste-or-upload a YAML file. Files: client (create
         modal), src/server.js.

107. [ ] Full Helm lifecycle. Today helm is read + rollback only (values /
         manifest / notes / history / rollback). Add install (from repo/OCI),
         upgrade (with values), uninstall, and repo/registry add+list. New
         /api/helm/{install, upgrade,uninstall,repo} in src/server.js using helm
         via execFileAsync (no-shell arg arrays) + client UI. Files:
         src/server.js, client.

# Already tracked elsewhere, re-surfaced by this review: multi-cluster (#16);

# faster / live-watch refresh (#46) - the current setInterval(refresh,5000)

# re-lists every type in all namespaces and pushes the whole payload over WS, so

# move to k8s watch/informers + incremental diffs + server-side scoping for large

# clusters; AI assistant (#78) - peers shipped this in 2025 (Headlamp AI assistant,

# Lens Prism); app auth (#94 part 2 → now #97).

108. [x] kubectl copy support (done: Shift+C on a pod / container opens CopyModal -
         a kubectl-cp file transfer dialog. DOWNLOAD a container path to the
         browser (single file as itself, a directory as <base>.tar) and UPLOAD a
         browser-picked file into a container dir. Backend GET/POST
         /api/cp/:ns/:pod/:container reuse the real `kubectl cp` (execFile, no
         shell) staging bytes in a per-request mkdtemp that is always cleaned up;
         validId on ns/pod/container, validPath (no control chars / leading -) on
         the in-container path, safeBase strips traversal from the uploaded
         filename. ONE `copy` actions.js entry (panel chip + a palette + Shift+C);
         useKeys yields to the dialog like exec/debug. Live cluster only - the
         target image needs tar.)
109. [ ] we should be able to filter a resource and then also string search
         within a single command similar to k9s so for example ":pod
         /some-pod-name"

# ─────────────────────────────────────────────────────────────────────────────

# Local AWS testing with ministack (https://github.com/ministackorg/ministack)

# ministack is a free MIT-licensed AWS emulator (LocalStack-style): one gateway

# on port 4566, dummy creds (test/test), us-east-1, runs via

# `docker run -p 4566:4566 ministackorg/ministack` (also pip / docker compose).

# It emulates S3/EC2/EBS/VPC/security-groups/EIP/Lambda - i.e. every service the

# AWS module (#2, src/aws.js SERVICES) currently lists - so we can exercise the

# LIVE (non-MEZZ_AWS_DEMO) AWS code path end-to-end with zero AWS account/creds.

# Goal: stop relying solely on src/aws-mock.js for AWS dev/test.

# ─────────────────────────────────────────────────────────────────────────────

110. [ ] Add a custom AWS endpoint override so the SDK clients can point at
         ministack instead of real AWS. Today getClients() (src/aws.js) builds
         every client from just `{ region: REGION }` with no `endpoint`, so the
         live path always hits real AWS. Add a MEZZ_AWS_ENDPOINT (fall back to
         the SDK-standard AWS_ENDPOINT_URL) that, when set, is threaded into the
         shared `cfg` for the S3/EC2/STS/Lambda clients. S3 against a local
         gateway needs `forcePathStyle: true` (path-style bucket URLs) - apply it
         only to the S3Client when an endpoint override is present. Also fold the
         endpoint env into AWS_ENABLED so setting it auto-enables the module the
         way the credential env vars do. Keep it endpoint-agnostic (works for
         ministack, LocalStack, or a real account) - no ministack-specific code.

111. [ ] Add ministack as a dev service so AWS features can be driven without
         real credentials. Wire `docker run -p 4566:4566 ministackorg/ministack`
         into the devcontainer / a compose service (or a small helper script),
         and document the env to point mezz at it:
         `MEZZ_PROVIDER=aws MEZZ_AWS=1 MEZZ_AWS_ENDPOINT=http://localhost:4566
         AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_REGION=us-east-1`.
         Health-check with `curl http://localhost:4566/_ministack/health` before
         starting the server. (Depends on #110.)

112. [ ] Add a seed script (scripts/setup-aws.sh, the AWS analog of
         scripts/setup-cluster.sh) that idempotently creates demo resources in
         ministack via the aws CLI with `--endpoint-url http://localhost:4566`:
         a few S3 buckets each with some objects, EC2 instances spanning the
         states aws-mock.js fakes (running/stopped/terminated/pending), and
         EBS volumes / VPCs / security groups / elastic IPs / a Lambda function
         so every SERVICES entry returns real (not mock) rows. This is what makes
         the live SDK list/normalize code actually run.

113. [ ] Verify every AWS feature end-to-end against ministack on the LIVE path
         (MEZZ_AWS_DEMO unset), not just the mock. Cover: S3 bucket list, the
         async drill into a bucket (fetchS3Objects / ListObjectsV2 pagination),
         S3 object get + put via the S3CopyModal (s3GetObject/s3PutObject), and
         the EC2 start/stop/terminate state transitions (ec2Action,
         POST /api/aws/ec2/:region/:id/:op). Confirm awsConnected/awsRegion/
         awsIdentity in /api/health reflect the ministack STS GetCallerIdentity.
         Note any gap between ministack's responses and what the normalizers
         expect.

114. [ ] Document the ministack workflow (README + a note in modules.md): how to
         run it, the env block to point mezz at it, the seed script, and that it
         exercises the live AWS path with no account. ministack also emulates
         services beyond the current module (RDS, DynamoDB, SQS, IAM, ...), so
         it doubles as the local test bed for future intra-AWS SERVICES entries -
         capture that so the friction log (modules.md) keeps deriving the
         provider interface against a real (emulated) backend, not just mocks.

115. [ ] Connect providers at runtime in an unobtrusive way + cross-provider
         jumps. Today provider is DEPLOY-TIME only (MEZZ_PROVIDER, no UI switch -
         see modules.md "Provider is a DEPLOY-TIME config"); `activeProvider`
         exists in the store but is set once at boot. Revisit that for the
         multi-provider story: let a single running instance know about more than
         one provider and let the user jump between them without a redeploy. The
         motivating flow: from the AWS dashboard, view an EKS cluster and jump
         DIRECTLY into the k8s provider scoped to that cluster (resolve the EKS
         cluster's kubeconfig/endpoint, register it as a k8s context, switch the
         shell to the k8s provider focused on it). Keep it unobtrusive - not a
         loud always-present switcher; more like a contextual "open in k8s" action
         (an actions.js entry on the EKS row) + a quiet provider indicator. This
         is the natural meeting point of: ministack EKS (real k3s clusters, #110-
         #114 give us a live EKS to test against), the deferred cross-provider
         plugin interface (modules.md), and multi-cluster (#16, k8s-side context
         switching). Likely needs: an EKS service entry in the AWS SERVICES
         registry, a per-provider connection model (friction #7), and lifting
         `activeProvider` from boot-only to a real runtime switch. Discuss scope
         before building - this reopens a previously-settled decision.

116. [x] AWS inspect modal (AWS module #2). Give every AWS resource a depth view -
         the AWS-native analog of the k8s describe/yaml inspect, READ only (no
         edit, no secret decode; AWS resources mutate via specific Modify/Put
         calls, not apply-a-doc). Reused the existing ActionModal read-view rather
         than a parallel modal: new modal type `aws-inspect` with a
         DESCRIBE / JSON / TAGS toggle (Tab cycles, `/` searches, Esc closes;
         defaults to JSON - the raw Describe*/Get* output, the "yaml" analog;
         TAGS = the resource's tags as a first-class section). Backend: each
         src/aws.js SERVICES entry gained an optional `describe(clients,id,region)`
         returning the rich raw SDK object (EC2 Instance, S3 config aggregate of
         GetBucket{Location,Versioning,Encryption,Acl,Tagging,PolicyStatus,
         PublicAccessBlock}, GetFunction, DescribeVolumes/Vpcs/SecurityGroups/
         Addresses), plus fetchAwsDescribe() (3-tier live->mock->error),
         tagsToMap() (handles both the [{Key,Value}] array + Lambda's flat map),
         and a generic formatAwsDescribe() kubectl-describe-style formatter (so
         "add inspect for a service" stays one describe() fn). New route
         GET /api/aws/describe/:service/:region/:id (validId guards, service must
         be in the registry; inherits the #97 auth gate). getMockAwsDescribe() in
         src/aws-mock.js gives believable detail + Tags for all 7 services so it
         is fully testable with MEZZ_AWS_DEMO=1. Frontend: ONE actions.js
         registry entry (`aws-inspect`, group Inspect, key `d`); Enter on any
         non-drillable AWS resource opens it too (s3buckets still drills into
         objects). Verified with MEZZ_PROVIDER=aws MEZZ_AWS_DEMO=1: curl per
         service + Playwright across EC2 / S3 / Lambda (JSON+TAGS+DESCRIBE render,
         Tab cycles, `/` search highlights, Esc closes, Enter-opens-inspect).
         k8s describe/yaml/json/edit unchanged (all branches guard on
         isAwsInspect / activeProvider==='aws' / AWS_RESOURCE_KEYS). See the now-
         removed handoff-aws-inspect.md + modules.md.

117. [ ] Evaluate vercel-labs/agent-browser as a lighter alternative to the
         Playwright MCP server for UI verification. Motivation: the Playwright MCP
         is a big context + CPU cost here - large accessibility snapshots bloat
         the transcript and a long-lived Chrome + a concurrent vite build is the
         single worst devcontainer-crash trigger (see CLAUDE.md "Devcontainer
         Crash Prevention"). agent-browser (https://github.com/vercel-labs/agent-
         browser) is a newer agent-oriented browser-automation library that may
         return leaner state and/or be cheaper to drive. Honest caveat before
         committing: it still drives a real Chromium, so the *CPU/memory* spike
         (the actual crash cause) may not shrink much - the likely win is *context*
         (smaller snapshots) and ergonomics, not host load. Worth a timeboxed
         spike: stand it up, drive one mezz flow (e.g. open a resource + an inspect
         modal), compare context size + observed load vs the current Playwright
         MCP run, and decide whether to switch the CLAUDE.md "Testing" workflow to
         it (or keep Playwright but tighten the screenshot-not-snapshot rule).

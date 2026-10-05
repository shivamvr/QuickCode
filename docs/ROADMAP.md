# QuickCode roadmap

Planned work, ordered so each item only depends on things above it. One file per
item in this folder; pick the lowest unstarted number and go.

Written September 2026, against the code as it stands after the
`perf(editor)` refactor (batched storage, `TABS` table, lazy editors, monaco
web workers).

## Order of work

| # | Item | Why it's here | Depends on | Size |
|---|------|---------------|-----------|------|
| 01 | [Sandbox the preview](01-sandbox-preview.md) | ~~Data loss: preview code shared the editor's origin and could wipe every saved file~~ **done** | — | S |
| 02 | [File System Access](02-file-system-access.md) | ~~Every save was a download, then a move by hand~~ **done** - Ctrl+S writes the file in place | 01 | M |
| 03 | [PWA, offline, file handling](03-pwa-offline.md) | ~~Could not start without a network, and lived in a tab~~ **done** - installable, offline, opens files from the desktop | 02 | M |
| 04 | [IndexedDB + multiple projects](04-indexeddb-projects.md) | ~~Only one project could exist; every experiment overwrote the last~~ **done** | 01 | L |
| 05 | [Share links](05-share-link.md) | ~~A snippet could only leave as a zip~~ **done** - the whole thing rides in the url fragment | 04 | S |
| 06 | [Preview console and errors](06-preview-console.md) | ~~Runtime errors and `console.log` vanished into a tab nobody was looking at~~ **done** | 01 | M |
| 07 | [Resizable split](07-resizable-split.md) | ~~The split is hard-coded 50/50~~ **done** | — | S |
| 08 | [Format on save](08-format-on-save.md) | ~~Small change, large daily payoff~~ **done** | — | S |
| 09 | [Upgrade monaco](09-monaco-upgrade.md) | ~~Pinned to 0.25.1 from mid-2021~~ **done** - on 0.52.2, the last release with the classic file layout | 15 | M |
| 10 | [TypeScript, JSX, Sass](10-typescript-jsx.md) | ~~Needs a real transpile step~~ **TypeScript and JSX done**; Sass dropped | 01, 09 | L |
| 11 | [npm imports](11-npm-imports.md) | ~~Make bare `import` specifiers work~~ **done** | 01 | M |
| 12 | [Version history](12-version-history.md) | ~~There was no recovery path from any mistake~~ **done** | 04 | M |
| 13 | [Diff view](13-diff-view.md) | ~~Nearly free once history existed~~ **done** | 09, 12 | S |
| 14 | [Emmet and theme polish](14-emmet-and-theming.md) | Emmet **done**; toolbar recolouring **reverted** by the owner | — | S |
| 15 | [Tests and repo hygiene](15-tests-and-repo-hygiene.md) | ~~Nothing above is safe to do twice without this~~ **done** — `node test/run.js` | — | M |

Sizes are rough: **S** an afternoon, **M** a day or two, **L** longer and worth
splitting further once started.

## Suggested grouping

**Do first, in this order:** ~~01~~ → ~~15~~ → ~~07~~, ~~08~~, ~~14~~ (Emmet only). 15 pays for itself immediately because 02, 04 and 09 all
touch code that is easy to break quietly. 07, 08 and 14 are independent and
small enough to slot in whenever.

**The two that change what QuickCode is:** ~~02~~ + ~~03~~ made it feel like a local
tool rather than a web page; ~~04~~ + ~~05~~ + 12 make it somewhere work actually
lives.

**Nothing is left.** All fifteen items are done, ~~11~~ last.

**Beyond the roadmap**, two AI features sharing one endpoint. The key lives in
the host's environment variables and `netlify/functions/ai.mjs` forwards to Groq,
so the browser never holds a credential and there is nothing to set up:

- [16 — Explain this error](16-ai-explain-error.md): asks about a console error,
  using the pane and line the console already works out.
- [17 — AI practice problems](17-ai-practice-problems.md): sets a problem into a
  new project, with tests that report in the console.

Both are done **and confirmed against the real service**. The first request made
with a real key failed - the model named in Groq's own documentation had been
withdrawn - so the model is now chosen from a live model list and both prompts
were tried against it. The function itself is checked in node
(`test/functions.js`); `node dev.mjs` runs it locally for the hop the suite
cannot make.

**This is the one thing that needs more than static hosting.** Everything else
still runs as plain files; without `GROQ_API_KEY` the AI features switch
themselves off and say so.

**Also beyond the roadmap**, one piece of housekeeping that turned out to be
worth its own page:

- [18 — One dialog of our own](18-modal-dialogs.md): `prompt()`, `confirm()` and
  `alert()` are gone from QuickCode, all sixteen of them, replaced by a dialog
  that can be styled, cannot be suppressed by the browser, and does not block
  the page. The save panel's spacing was straightened out in the same pass.

What the roadmap deliberately parked, in the order it is now worth doing:

- ~~**JSX.**~~ **Done, 1 October 2026.** It was a compiler option, a `.tsx`
  extension, and a named model for the js pane so the editor and the compiler
  agree about the same text. See the JSX Outcome in
  [10](10-typescript-jsx.md).
- **A folder as a project** (`showDirectoryPicker`), the natural replacement for
  zip import and export. Noted in 04.
- **`navigator.storage.persist()`**, so projects are less likely to be evicted.
  Noted in 04, deliberately not called yet: it prompts.
- **Sass**, if it is ever actually wanted. Dropped in 10 because plain CSS has
  nesting and custom properties natively now.

**No transpiler was added.** Item 10's plan called for esbuild-wasm; monaco
already ships the TypeScript compiler and item 09 already precaches its worker,
so TypeScript costs nothing to download and works offline. See the Outcome in
[10](10-typescript-jsx.md) before reaching for a build tool.

**Do not take monaco past 0.52.2** without reading the Outcome in
[09](09-monaco-upgrade.md): 0.53 onwards has content-hashed filenames and no
`workerMain.js`, which the worker bootstrap and the service worker's precache
list both depend on.

Of the two things 02 left for later, **remembering file handles across a
reload** is done (04 stores them per project and pane). **Directory handles** as
the replacement for zip import/export are still open, and now have somewhere to
live.

There is now a **service worker**, so anything that changes a file the shell
loads should bump `CACHE` in `sw.js`. Adding a script or stylesheet to
`index.html` also means adding it to `SHELL` - the suite fails if it is
forgotten.

**Leave until wanted:** 10, 11, 13.

## Before and after any change

Run `node test/run.js`. It exits non-zero on failure and takes about half a
minute. See [test/README.md](../test/README.md).

## Conventions these plans assume

- No build step, no `npm install`, no framework. Plain scripts loaded from
  `index.html`, libraries from CDN. Every plan here holds that line; where one
  cannot, it says so up front.
- Editors are created lazily through `ensure*Editor()`; never assume
  `cssEditor`, `jsEditor` or `splitEditor` exists.
- Content is read through `readStored(key)` and written through
  `writeSoon(key, value)`, which batches. Those now work against the open
  project record in memory, and `flushStorage()` writes it to IndexedDB;
  `scripts/store.js` is the only file that talks to the database.
- Settings go through `saveSettings(patch)`. The theme and the toolbar layout
  are global; everything else belongs to the project.
- `bootQuickCode()` is **async**: it loads the project before any editor exists.
  Anything added before that `await` must not touch an editor.
- The preview document is built in `scripts/preview.js`, by both the inline pane
  and `app.html`. **Nothing injected above the user's code may contain a
  newline**, or the line numbers the console reports stop matching the editor.
- The `main`/`css`/`js` mapping lives in `TABS`; add to the table rather than
  writing another three-branch `if`.

## Theme set

Trimmed from 19 to 13 in September 2026. Removed: **Slush, Solarizelight,
Textmate, Tomorrow** (the four light themes - the hardcoded `.mtk*` token
colours in `tabs.css` rendered their default text at under 2:1 contrast),
**Oceanic** (byte-for-byte identical to OceanicNext) and **cobalt2**.

`settheme()` now distinguishes a 404 from a network error: a theme whose file is
gone resets the stored preference to `vs-dark` once, while a transient failure
keeps the user's choice. Without that, deleting a theme leaves anyone who had it
selected with a console error on every load.

## Decided against

- **Recolouring the toolbar from the editor theme** — built and reverted,
  September 2026. The teal/blue gradient scheme is deliberate; a theme-derived
  flat palette was tried and rejected. See
  [14-emmet-and-theming.md](14-emmet-and-theming.md) before proposing it again.
- **Keyboard and ARIA pass on the toolbar** — proposed and declined by the
  owner, September 2026. The toolbar controls are deliberately plain `div` and
  `img` elements wired with `addEventListener`. Do not reintroduce `<button>`,
  `role`, `tabindex` or `aria-*` in `index.html` without asking.

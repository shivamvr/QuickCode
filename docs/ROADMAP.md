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
| 05 | [Share links](05-share-link.md) | Highest value per line of code, and needs no backend | 04 | S |
| 06 | [Preview console and errors](06-preview-console.md) | Runtime errors and `console.log` currently vanish | 01 | M |
| 07 | [Resizable split](07-resizable-split.md) | ~~The split is hard-coded 50/50~~ **done** | — | S |
| 08 | [Format on save](08-format-on-save.md) | ~~Small change, large daily payoff~~ **done** | — | S |
| 09 | [Upgrade monaco](09-monaco-upgrade.md) | Pinned to 0.25.1 from mid-2021 | 15 | M |
| 10 | [TypeScript, JSX, Sass](10-typescript-jsx.md) | Needs a real transpile step | 01, 09 | L |
| 11 | [npm imports](11-npm-imports.md) | Make bare `import` specifiers work | 01 | M |
| 12 | [Version history](12-version-history.md) | There is no recovery path from any mistake | 04 | M |
| 13 | [Diff view](13-diff-view.md) | Nearly free once history exists | 09, 12 | S |
| 14 | [Emmet and theme polish](14-emmet-and-theming.md) | Emmet **done**; toolbar recolouring **reverted** by the owner | — | S |
| 15 | [Tests and repo hygiene](15-tests-and-repo-hygiene.md) | ~~Nothing above is safe to do twice without this~~ **done** — `node test/run.js` | — | M |

Sizes are rough: **S** an afternoon, **M** a day or two, **L** longer and worth
splitting further once started.

## Suggested grouping

**Do first, in this order:** ~~01~~ → ~~15~~ → ~~07~~, ~~08~~, ~~14~~ (Emmet only). 15 pays for itself immediately because 02, 04 and 09 all
touch code that is easy to break quietly. 07, 08 and 14 are independent and
small enough to slot in whenever.

**The two that change what QuickCode is:** ~~02~~ + ~~03~~ made it feel like a local
tool rather than a web page; ~~04~~ + 05 + 12 make it somewhere work actually
lives. **05 is now the one to do next** - it is small, needs no backend, and
projects give it something worth sharing.

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

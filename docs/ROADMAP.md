# QuickCode roadmap

Planned work, ordered so each item only depends on things above it. One file per
item in this folder; pick the lowest unstarted number and go.

Written September 2026, against the code as it stands after the
`perf(editor)` refactor (batched storage, `TABS` table, lazy editors, monaco
web workers).

## Order of work

| # | Item | Why it's here | Depends on | Size |
|---|------|---------------|-----------|------|
| 01 | [Sandbox the preview](01-sandbox-preview.md) | **Data loss today.** Preview code shares the editor's origin and can wipe every saved file | — | S |
| 02 | [File System Access](02-file-system-access.md) | Open and save real files on disk; removes the download/re-zip round trip | 01 | M |
| 03 | [PWA, offline, file handling](03-pwa-offline.md) | Installable, works offline, opens `.html`/`.css`/`.js` from the OS | 02 | M |
| 04 | [IndexedDB + multiple projects](04-indexeddb-projects.md) | Only one project can exist today; every experiment overwrites the last | 01 | L |
| 05 | [Share links](05-share-link.md) | Highest value per line of code, and needs no backend | 04 | S |
| 06 | [Preview console and errors](06-preview-console.md) | Runtime errors and `console.log` currently vanish | 01 | M |
| 07 | [Resizable split](07-resizable-split.md) | The split is hard-coded 50/50 | — | S |
| 08 | [Format on save](08-format-on-save.md) | Small change, large daily payoff | — | S |
| 09 | [Upgrade monaco](09-monaco-upgrade.md) | Pinned to 0.25.1 from mid-2021 | 15 | M |
| 10 | [TypeScript, JSX, Sass](10-typescript-jsx.md) | Needs a real transpile step | 01, 09 | L |
| 11 | [npm imports](11-npm-imports.md) | Make bare `import` specifiers work | 01 | M |
| 12 | [Version history](12-version-history.md) | There is no recovery path from any mistake | 04 | M |
| 13 | [Diff view](13-diff-view.md) | Nearly free once history exists | 09, 12 | S |
| 14 | [Emmet and theme polish](14-emmet-and-theming.md) | Two visible inconsistencies | — | S |
| 15 | [Tests and repo hygiene](15-tests-and-repo-hygiene.md) | Nothing above is safe to do twice without this | — | M |

Sizes are rough: **S** an afternoon, **M** a day or two, **L** longer and worth
splitting further once started.

## Suggested grouping

**Do first, in this order:** 01 → 15 → 07, 08, 14.
01 is an active bug. 15 pays for itself immediately because 02, 04 and 09 all
touch code that is easy to break quietly. 07, 08 and 14 are independent and
small enough to slot in whenever.

**The two that change what QuickCode is:** 02 + 03 make it feel like a local
tool rather than a web page; 04 + 05 + 12 make it somewhere work actually lives.

**Leave until wanted:** 10, 11, 13.

## Conventions these plans assume

- No build step, no `npm install`, no framework. Plain scripts loaded from
  `index.html`, libraries from CDN. Every plan here holds that line; where one
  cannot, it says so up front.
- Editors are created lazily through `ensure*Editor()`; never assume
  `cssEditor`, `jsEditor` or `splitEditor` exists.
- Content is read through `readStored(key)` and written through
  `writeSoon(key, value)`, which batches. Call `flushStorage()` before anything
  outside the page reads it.
- Settings go through `saveSettings(patch)` and are written straight through.
- The `main`/`css`/`js` mapping lives in `TABS`; add to the table rather than
  writing another three-branch `if`.

## Decided against

- **Keyboard and ARIA pass on the toolbar** — proposed and declined by the
  owner, September 2026. The toolbar controls are deliberately plain `div` and
  `img` elements wired with `addEventListener`. Do not reintroduce `<button>`,
  `role`, `tabindex` or `aria-*` in `index.html` without asking.

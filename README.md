<h1 align="center">QuickCode</h1>

<p align="center">
  A code playground that runs entirely in your browser.<br>
  Built on <b>Monaco</b> — the editor behind VS Code.
</p>

---

Write HTML, CSS and JavaScript, see it run beside you, and keep it in named projects.
No build step, no `npm install`, no sign-in. Serve the folder and it works — and after
the first visit it works offline too.

---

## Features

| | |
|---|---|
| **Three editors** | HTML, CSS and JS panes, each its own Monaco instance. Per-pane checkboxes switch a file out of the preview without deleting it. Emmet in the HTML pane. |
| **Live preview + console** | Rebuilds as you type. `log`, `warn`, `error`, uncaught errors and rejected promises all report with **your** line numbers, not the generated document's. **stop** gets you out of a `while (true)`. |
| **npm imports** | `import confetti from "canvas-confetti"` just works — resolved to [esm.sh](https://esm.sh) through an import map. Versions, scopes, deep paths, full URLs and dynamic `import()` too. |
| **TypeScript** | Click the **js** badge on the js pane and it reads **ts**. Type errors go to the console and the code still runs; a syntax error runs nothing. Uses Monaco's own compiler, so it works offline. |
| **JSX** | Write JSX in the **ts** pane with no `import React` and no config. Errors point at the line you wrote. |
| **AI help** | Explain any console error, or have a practice problem written into a new project — statement, stub and PASS/FAIL tests. Needs a key; see below. |
| **Projects** | Named projects in IndexedDB. Each keeps its own three files, language, tab, split state, preview toggles and files on disk. Rename, duplicate, delete. |
| **History** | Automatic snapshots after a minute of quiet, before anything that replaces a pane, and whenever you ask. Compare any snapshot with what's open, side by side. Restore is itself undoable. |
| **Split view** | Two files side by side, each a different language, synced both ways, cursor remembered per file. |
| **Real files** | <kbd>Ctrl</kbd>+<kbd>S</kbd> writes back to the file you opened — no copy in `Downloads`. Each pane keeps its own file. Export and re-import the whole project as a zip. |
| **Share links** | The whole snippet compressed into the URL fragment. No backend, nothing uploaded, works offline. |
| **15 themes** | Monaco's own `vs` and `vs-dark`, plus 13 more: Ayu Dark, Cobalt, Synthwave, Dracula, Monokai, Solarized Dark, Oceanic Next, Night Blue, Night, Night Owl, idleFingers, Eighties, Zenburnesque. |
| **Installable** | A PWA: its own window and icon, opens `.html`/`.css`/`.js` from the desktop, and the whole Monaco bundle is cached so it starts on a plane. |
| **Nothing is lost** | Every keystroke is kept in the browser as well as on disk. Settings come back exactly as you left them. |

### Keyboard shortcuts

On top of Monaco's own. The ones marked ▸ are also in the right-click menu.

| Shortcut | Action |
|---|---|
| <kbd>Alt</kbd> + <kbd>Z</kbd> | ▸ Toggle word wrap |
| <kbd>Alt</kbd> + <kbd>+</kbd> / <kbd>-</kbd> | ▸ Font zoom in / out |
| <kbd>Alt</kbd> + <kbd>0</kbd> | ▸ Reset font size |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>L</kbd> | ▸ Toggle font ligatures |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> | ▸ Fold all / unfold all |
| <kbd>Ctrl</kbd> + <kbd>D</kbd> | Copy line down |
| <kbd>Ctrl</kbd> + <kbd>Q</kbd> | Add selection to next match |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save to the open file |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> | Save as |

---

## Four things worth knowing

- **Imports make your snippet a module.** Top-level names stop being global, so
  `onclick="myFunction()"` in the html pane will not find a function declared in the js
  pane. A snippet with no imports is untouched.
- **Imports and AI need a network.** Everything else here does not.
- **Anyone holding a share link can read the code.** Don't put credentials in one.
- **Writing back to a file needs the File System Access API** (Chrome, Edge, Chromium).
  Firefox and Safari fall back to the file dialog and a download.

---

## Getting started

```bash
git clone https://github.com/shivamvr/QuickCode.git
cd QuickCode
```

Then serve the folder — any of these:

| | |
|---|---|
| **Node, with AI** | `node dev.mjs` → http://localhost:8080 |
| **Node** | `npx serve` |
| **Python** | `python -m http.server 5501` |
| **VS Code** | *Live Server* → **Go Live** (port `5501` is preset) |

A server is needed rather than opening the file directly: themes are fetched, and the
preview window talks over `localStorage`. Installing and offline support need `localhost`
or HTTPS.

### Turning on the AI features

They are off until a key is set, and say so in the console when they are.

**Deployed** — set **`GROQ_API_KEY`** in your host's environment variables and redeploy.
A free key takes about thirty seconds: [console.groq.com/keys](https://console.groq.com/keys).
`netlify.toml` already says what to publish and where the function lives; Vercel needs the
function moved to `api/ai.mjs` and nothing else.

**Locally** — a plain file server cannot serve `/api/ai`, so use [dev.mjs](dev.mjs), which
runs the function in process:

```bash
cp .env.example .env     # put your key in it; .env is gitignored
node dev.mjs
```

The key lives on the server and the browser never sees it, so there is nothing to leak and
nothing to keep out of a share link. It runs on [Groq](https://groq.com)'s free tier —
roughly a thousand requests a day, **shared between everyone using your site**.

**Never commit the key.** Keys in public repositories get found fast.

---

## Tests

```bash
node test/run.js          # 258 checks, headless Chrome
CASES=core node test/run.js
```

`test/README.md` covers what each case does and what the suite has learned the hard way.

---

## Project structure

```
QuickCode/
├── index.html              # the editor
├── app.html                # the live preview window
├── dev.mjs                 # local server that also runs the AI function
├── sw.js                   # service worker: the offline cache
├── netlify.toml            # what to publish, and where the function lives
├── scripts/
│   ├── index.js            # editor, persistence, files, themes, tabs, projects
│   ├── store.js            # the project store: IndexedDB, migration, crash net
│   ├── preview.js          # building the preview document and its console
│   ├── eventListener.js    # split view, export, cursor sync, editor actions
│   ├── cssEditor.js        # ┐
│   ├── jsEditor.js         # ├ the other Monaco instances
│   ├── splitEditor.js      # ┘
│   ├── typescript.js       # compiling the js pane, and JSX
│   ├── imports.js          # finding bare specifiers, building the import map
│   ├── diff.js             # a snapshot beside what is open
│   ├── modal.js            # the one dialog; there are no native prompts left
│   ├── ai.js               # asking the model, and what to say when it fails
│   ├── problems.js         # practice problems into a new project
│   ├── share.js            # the codec for the URL fragment
│   └── fileSaver.js        # FileSaver.js (vendored)
├── netlify/functions/
│   └── ai.mjs              # the only non-static part: it holds the key
├── styles/                 # layout, tabs, vertical toolbar
├── themes/                 # the 13 theme definitions that are not built in
├── icon/                   # UI icons and the installed app's icons
├── docs/                   # the roadmap, and one write-up per item
└── test/                   # node test/run.js
```

Each feature has a page in [docs/](docs/ROADMAP.md) saying why it exists, what was decided
and what was left undone.

---

## Built with

- [Monaco Editor](https://microsoft.github.io/monaco-editor/) 0.52.2 — the editor core
- [emmet-monaco-es](https://github.com/troy351/emmet-monaco-es) 5.7.0 — Emmet
- [JSZip](https://stuk.github.io/jszip/) — project export / import
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/) — downloads
- [monaco-themes](https://github.com/brijeshb42/monaco-themes) — theme definitions

All from CDN. There is nothing to install.

## Licence

[MIT](LICENSE) — Copyright (c) 2026 Shivam. Do what you like with it, keep the notice.

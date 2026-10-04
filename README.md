<h1 align="center">QuickCode</h1>

<p align="center">
  A fast, zero-install code playground that runs entirely in your browser.<br>
  Powered by the <b>Monaco</b> editor — the same engine behind VS Code.
</p>

---

## What it is

QuickCode is a browser-based editor for writing and previewing HTML, CSS and JavaScript
without setting up a project, installing a toolchain, or even being online after first load.

Open `index.html`, start typing, and hit **Run** — your page opens in a live preview tab that
updates as you edit. Everything you write is saved to your browser automatically, so closing
the tab never loses your work.

There is **no build step and no `npm install`**. It is plain HTML, CSS and JavaScript.

---

## Features

### ✍️ Three editors, one workspace

Dedicated tabs for **HTML**, **CSS** and **JS**, each with its own Monaco instance, syntax
highlighting, IntelliSense, bracket matching, code folding and minimap.

- **HTML / main tab** — also switchable to `plaintext`, `css`, `javascript` or `json` when you
  just want a scratch editor for a single file
- **CSS tab** and **JS tab** — with a checkbox on each tab to **enable or disable that file in
  the preview**, so you can toggle a stylesheet or a script off without deleting it
- **Emmet abbreviations** in the HTML editor — type `div.card>ul>li*3` and press <kbd>Tab</kbd>

### 📦 Import a package, no build step

Write the import you would write anywhere else, in the **js** pane:

```js
import confetti from "canvas-confetti"
confetti()
```

Nothing goes in the html pane. QuickCode reads your code, works out which packages
you named, and points them at [esm.sh](https://esm.sh) through an
[import map](https://developer.mozilla.org/docs/Web/HTML/Element/script/type/importmap).

- **Pin a version** if you want one: `import { nanoid } from "nanoid@5"`
- **Scoped packages and deep paths** work: `@scope/pkg`, `lodash-es/debounce`
- **Full URLs** work too, if you would rather be explicit
- **Dynamic `import()`** of a package name works
- **A name that does not exist says so**, in the console, with the package named -
  a browser reports nothing at all when a module fails to load, so QuickCode asks
  first
- **This is the one thing that needs a network.** Everything else in QuickCode works
  offline; packages are fetched from esm.sh. Offline, the console says exactly that
  rather than leaving you with a preview that silently does nothing

**One behaviour worth knowing.** A snippet that imports runs as a module, which means
its top-level names are no longer global - so `onclick="myFunction()"` in the html pane
will not find a `function myFunction` declared in the js pane. A snippet with **no**
imports is untouched and keeps working exactly as before.

### 🤖 AI help, with a free key

Two things, both optional, both off until you set them up.

**Explain an error.** Every error in the console carries an **explain**. Click it and the
error goes off with the pane it came from, the line, and your three files - the line numbers
being the ones the editor is showing you. The answer appears in the console.

**Set me a practice problem.** `+ AI practice problem` in the project dropdown asks what you
want - `binary trees, medium`, `array methods`, `something visual`, or nothing at all - and
makes a **new project** holding the problem: the statement as a comment, a stub to fill in,
and tests that print PASS or FAIL in the console. It opens on the preview, ready to run.

Problems can use all three panes, so "build a debounce visualiser" works as well as a pure
algorithm puzzle.

**Nothing to set up.** No key, no sign-in, no dialog. The key lives on the server, in a small
function, and the browser never sees it - so there is nothing in your browser to leak and
nothing to keep out of a share link.

It runs on [Groq](https://groq.com)'s free tier: roughly a thousand requests a day, shared
between everyone using the site. If that runs out, the console says so and it resets tomorrow.

**Whatever goes wrong, it says which thing.** A spent allowance, a key the owner needs to
replace, a model that has been withdrawn, a host that is down and no network at all are five
different messages - because the function passes the status through instead of flattening
everything into "something went wrong".

**It needs a network**, like imports and unlike everything else here.

### Running your own copy with AI

The AI features need one environment variable. Everything else is still just files.

1. Deploy the repo to **Netlify** (or Vercel - the function is written in the web-standard
   shape, so it is a file move to `api/ai.mjs`)
2. Set **`GROQ_API_KEY`** in the site's environment variables. A free key, no card, takes
   about thirty seconds: [console.groq.com/keys](https://console.groq.com/keys)
3. That is it. `netlify.toml` already says what to publish and where the function lives

Without that variable the AI features switch themselves off and say so in the console. Nothing
else is affected - QuickCode still works as plain files on GitHub Pages, minus the two AI
features.

**Never commit the key.** It belongs in the host's environment variables, not in the repo -
keys in public repositories get found fast.

#### Trying the AI features locally

A plain file server cannot serve `/api/ai`, so on `python -m http.server` the AI features
correctly report that there is no endpoint. To run the function too:

```bash
cp .env.example .env     # then put your key in it; .env is gitignored
node dev.mjs             # http://localhost:8080
```

[dev.mjs](dev.mjs) serves the files and runs `netlify/functions/ai.mjs` in process, so the AI
features behave as they do deployed. It prints each `/api/ai` request and its status, which is
where a spent allowance or a withdrawn model shows up first. `netlify dev` works too, if you
would rather have the real thing.

### ⚛️ JSX, with React

Switch the js pane to **ts** and write JSX. No `import React`, no configuration:

```jsx
import { createRoot } from "react-dom/client"

const App = () => <h1>hello from jsx</h1>

createRoot(document.getElementById("root")).render(<App />)
```

React arrives through the same import map as any other package, so there is nothing to
install and nothing to set up. Errors still point at the line **you** wrote, even though
six lines of markup compile down to one function call.

JSX needs the **ts** flavour, because it has to be compiled. In the plain **js** flavour
it fails with a syntax error rather than quietly doing nothing.

Types inside JSX are not checked - React arrives as `any`. You get JSX that compiles and
runs, not a type-checked React project.

### 🅣 TypeScript in the js pane

The **js** tab carries a small **js** badge. Click it and it says **ts**: that pane is now
TypeScript, and the preview compiles it before running it.

- **Per project.** One project can be TypeScript while another stays plain javascript, and
  the setting travels with the project
- **Type errors appear in the console** against the line they are on, and the code still runs
  — the compiler disagreeing with you is not a reason to refuse to run
- **A syntax error runs nothing**, rather than leaving the last version running as though it
  were current
- **Runtime errors report the line you wrote**, not the line of the compiled output. Stripping
  types removes lines, so the emitted source map is read to work the number back
- **Nothing is downloaded for this.** It uses the TypeScript that monaco already ships, so it
  works offline the first time you try it
- **Plain javascript projects are untouched** — there is no compile step on that path at all

Switching flavour keeps your text, your undo history and your cursor exactly where they were.

### 🖥️ Live preview, with a console

Pick **preview** in the split menu and it runs beside the editor; the **Run** icon still opens
it in its own tab.

- HTML mode renders your markup with the CSS and JS you've enabled
- It **refreshes as you type**, rebuilding in place rather than reloading
- JavaScript mode runs your script directly; plaintext mode renders it as escaped text
- **stop** empties the frame, which is how you get out of an accidental `while (true)`, and
  **run** starts it again

Under the preview is a **console**. `console.log`, `warn` and `error` from your snippet appear
there with every argument, and so do uncaught errors and rejected promises — tagged with the
line in **your editor**, `js:3` rather than a line of the document QuickCode generated.

Your code still runs sandboxed on an opaque origin, so it cannot reach your saved work; the
console is a one-way report, not a way in.

### ⬄ Split view

Work on two files side by side. Open the split menu, pick **html**, **css** or **js** for the
second pane, and edit both at once.

- Each pane can hold a **different language**
- Content stays **in sync both ways** — edit in either pane and the other follows
- Your **cursor position is remembered per file** when you move between panes
- Collapse back to a single editor at any time

### 🗂 Projects

Work lives in **named projects**, in IndexedDB rather than in three shared browser keys, so
starting something new no longer writes over the last thing.

- Pick one from the **project dropdown** in the toolbar, or make one with **+ new project**
- **Rename**, **duplicate** and **delete** are in the same menu
- Each project keeps its own three files, its own language, tab, split and preview toggles,
  and its own files on disk - so switching lands you exactly where you left that project
- A duplicate is a real copy: it deliberately does not inherit the originals' files on disk,
  so saving it cannot write over them

An install from before projects existed is migrated on first load. Its old storage keys are
left untouched that once, as a safety net, and cleared on the load after - by which point the
work has come back out of the database at least one time.

### 🕓 History

The **history dropdown** lists snapshots of the project you have open, newest first, with the
time, why it was taken, and how many lines it gained or lost.

QuickCode takes one **after a minute of quiet following an edit**, **immediately before
anything that replaces a pane wholesale** — opening a file into it, importing a zip — and
whenever you pick **+ snapshot now**.

- **Name your own.** `+ snapshot now` asks what to call it, and the name is what the list
  shows. Naming a state that is already saved renames that entry rather than storing it twice.
  The automatic ones are never named — a prompt appearing a minute after you stopped typing
  would be unbearable
- **Compare** one with the **⇄** on its row: the snapshot and what is open, side by side
  in the split pane, with tabs for html, css and js. The live side follows your typing, so
  the differences update as you work, and `restore` in its bar acts on what you just read
- **Restore** by clicking one: all three files come back as they were. It asks first, and
  takes a snapshot on the way in, so a restore can itself be undone
- **Delete** a single entry with the **×** on its row, or wipe the lot with **clear history**.
  Both ask first, and neither touches your files
- Identical snapshots are never stored twice, so sitting idle does not fill it up
- The last 10 are always kept, then one an hour for a day and one a day after that, capped at
  50 per project
- Deleting a project deletes its history with it

### 📂 Open & save real files

| Action | What happens |
|---|---|
| **Open file** | Load a `.html`, `.css`, `.js`, `.json` or `.txt` file into the active tab — the editor language switches to match the extension |
| **Save** | <kbd>Ctrl</kbd> + <kbd>S</kbd> writes straight back to the file you opened — no copy in `Downloads`, nothing to move by hand |
| **Save as** | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd>, or the toolbar's save icon, opens the dialog: leave the name as it is to save the open file, change it to save a new one |
| **Reopen** | The file each pane was editing is remembered with the project, so it is still there after a reload - the browser asks once for permission to write to it again |
| **Export project** | Package all three editors into `QuickCode.zip` as `index.html` + `style.css` + `index.js`, correctly wired together with `<link>` and `<script>` tags |
| **Open project** | Drop a previously exported `.zip` back in and all three editors are restored |

Each tab keeps its **own file**, so an HTML page, its stylesheet and its script can all be
open and saved independently. The browser tab shows which file the active pane will save to,
with a ● while it has unsaved changes.

Editing files in place needs the File System Access API (Chrome, Edge and other Chromium
browsers). In Firefox and Safari, opening and saving fall back to the file dialog and a
download, exactly as before.

The export is a **ready-to-run project folder**, not a dump — if your HTML has no
`<head>`/`<body>`, QuickCode wraps it in a full document for you.

### 🔗 Share a snippet as a link

**🔗 copy share link** in the save dialog turns whatever is open into a URL.

The whole snippet — all three files, the language and the two preview toggles — is
compressed into the URL's fragment, which browsers never send to a server. There is no
backend, nothing is uploaded, and the link keeps working offline.

- It tells you **how big** the link is, and warns when it passes ~8 KB, where chat apps and
  mail clients start truncating. Use export for anything larger.
- **Anyone holding the link can read the code**, which the button says out loud. Do not
  share one with credentials in it.
- Opening a link makes a **new project** and leaves whatever you were working on exactly as
  it was.
- The format is plain deflate in base64url, not a private encoding — the test suite builds a
  link in Node and opens it in the browser to keep it that way.

### 🎨 13 editor themes

Switch instantly from the theme dropdown: `vs`, `vs-dark`, Ayu Dark, Cobalt,
Synthwave, Dracula, Monokai, Solarized Dark, Oceanic Next, Night Blue, Night,
Night Owl, idleFingers, Eighties and Zenburnesque.

### 🧭 Adaptive interface

- **Horizontal or vertical toolbar** — toggle with the align button
- **Fully hideable toolbar** for a distraction-free, full-height editor
- **Responsive** — automatically switches to the vertical layout on narrow screens (≤ 670px)
- **Scroll-to-top** button for long files

### ⌨️ Keyboard shortcuts

Custom actions added on top of the full set of Monaco defaults. The ones marked ▸ also appear
in the editor's **right-click context menu**.

| Shortcut | Action |
|---|---|
| <kbd>Alt</kbd> + <kbd>Z</kbd> | ▸ Toggle word wrap |
| <kbd>Alt</kbd> + <kbd>+</kbd> / <kbd>-</kbd> | ▸ Font zoom in / out |
| <kbd>Alt</kbd> + <kbd>0</kbd> | ▸ Reset font size |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>L</kbd> | ▸ Toggle font ligatures |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> | ▸ Fold all / unfold all |
| <kbd>Ctrl</kbd> + <kbd>D</kbd> | Copy line down |
| <kbd>Ctrl</kbd> + <kbd>Q</kbd> | Add selection to next match |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save to the open file, or ask where to put it |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> | Save as |

### 📥 Install it, and use it with no network

QuickCode is a progressive web app. In Chrome or Edge, the address bar offers **Install**,
and it then has its own window, its own icon and a Start-menu entry.

- **Works offline.** The editor, every theme, the icons and the whole Monaco bundle -
  including the language services behind IntelliSense - are cached on the first visit. After
  that it opens on a plane.
- **Opens files from the desktop.** Once installed, QuickCode registers as a handler for
  `.html`, `.css` and `.js`. Double-click one and it opens in the pane that matches its type,
  already attached, so <kbd>Ctrl</kbd> + <kbd>S</kbd> writes back to that file. If the pane it
  would land in holds work that is in no file, it asks first.
- **Stays current.** Its own files are fetched from the network first and only fall back to
  the cache when that fails, so an update is never a version behind. The pinned CDN bundles
  are served from the cache and refreshed in the background.

### 💾 Nothing is lost

Your files are never only on disk: every keystroke is also kept in the browser, so an
unsaved buffer survives a crash or a closed tab. Writes are batched while you type and a
synchronous snapshot is taken as the page goes away, so even the last few hundred
milliseconds of typing come back.

Your code **and** your settings — active theme, language, current tab, split state, CSS/JS
toggles, toolbar layout — are all restored exactly as you left them on your next visit. The
files live in IndexedDB, one record per project; the settings stay in `localStorage`, which
is where the preview window reads them from.

---

## Getting started

Clone the repo and serve the folder over a local HTTP server:

```bash
git clone https://github.com/shivamvr/QuickCode.git
cd QuickCode
```

Then either:

- **VS Code** — install the *Live Server* extension and click **Go Live**
  (the port is preset to `5501` in [.vscode/settings.json](.vscode/settings.json))
- **Python** — `python -m http.server 5501`
- **Node** — `npx serve`
- **Node, with the AI features** — `node dev.mjs`, which also runs the function that
  holds the key (see [above](#running-your-own-copy-with-ai))

Open `http://localhost:5501` and you're in.

> A server is needed rather than opening the file directly, because themes are loaded with
> `fetch` and the preview window communicates over `localStorage`.
>
> Installing and offline support need `localhost` or HTTPS, which Live Server and GitHub
> Pages both are.

---

## Project structure

```
QuickCode/
├── index.html              # the editor UI
├── app.html                # the live preview window
├── scripts/
│   ├── index.js            # main editor, persistence, file open/save, themes, tabs
│   ├── cssEditor.js        # CSS editor instance
│   ├── jsEditor.js         # JS editor instance
│   ├── splitEditor.js      # split-pane editor instance
│   ├── eventListener.js    # split view, project export, cursor sync, editor actions
│   ├── store.js            # the project store: IndexedDB, migration, crash net
│   ├── share.js            # share links: the codec for the URL fragment
│   └── fileSaver.js        # FileSaver.js (vendored)
├── styles/
│   ├── style.css           # layout, toolbar, editors
│   ├── tabs.css            # tab bar and split menu
│   └── verticalNav.css     # vertical toolbar layout (toggled on demand)
├── themes/                 # 13 Monaco theme definitions
├── icon/                   # UI icons, and the installed app's icons
├── manifest.webmanifest    # name, icons, and the file types it can open
├── sw.js                   # service worker: the offline cache
├── docs/                   # the roadmap, one plan per item
└── test/                   # the headless browser suite: node test/run.js
```

## Built with

- [Monaco Editor](https://microsoft.github.io/monaco-editor/) 0.52.2 — the editor core
- [emmet-monaco-es](https://github.com/troy351/emmet-monaco-es) 5.7.0 — Emmet support
- [JSZip](https://stuk.github.io/jszip/) — project export / import
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/) — file downloads
- [monaco-themes](https://github.com/brijeshb42/monaco-themes) — theme definitions

Third-party libraries are loaded from CDN; there are no local dependencies to install.

## Licence

[MIT](LICENSE) - Copyright (c) 2026 Shivam. Do what you like with it, keep the notice.

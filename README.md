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

### 🖥️ Live preview

Click the **Run** icon to open your code in a new tab.

- HTML mode renders your markup with the CSS and JS you've enabled
- The preview **reloads itself as you type** — no manual refresh
- JavaScript mode runs your script directly; plaintext mode renders it as escaped text

### ⬄ Split view

Work on two files side by side. Open the split menu, pick **html**, **css** or **js** for the
second pane, and edit both at once.

- Each pane can hold a **different language**
- Content stays **in sync both ways** — edit in either pane and the other follows
- Your **cursor position is remembered per file** when you move between panes
- Collapse back to a single editor at any time

### 📂 Open & save real files

| Action | What happens |
|---|---|
| **Open file** | Load a `.html`, `.css`, `.js`, `.json` or `.txt` file into the active tab — the editor language switches to match the extension |
| **Save** | <kbd>Ctrl</kbd> + <kbd>S</kbd> writes straight back to the file you opened — no copy in `Downloads`, nothing to move by hand |
| **Save as** | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd>, or the toolbar's save icon, opens the dialog: leave the name as it is to save the open file, change it to save a new one |
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

### 💾 Nothing is lost

Your files are never only on disk: every keystroke is also kept in the browser, so an
unsaved buffer survives a crash or a closed tab. What a reload does *not* restore is the
link to the file itself — a file opened before the reload has to be reopened before
<kbd>Ctrl</kbd> + <kbd>S</kbd> can write to it again.

Your code **and** your settings — active theme, language, current tab, split state, CSS/JS
toggles, toolbar layout — all persist in `localStorage` and are restored exactly as you left
them on your next visit.

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

Open `http://localhost:5501` and you're in.

> A server is needed rather than opening the file directly, because themes are loaded with
> `fetch` and the preview window communicates over `localStorage`.

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
│   ├── fileSaver.js        # FileSaver.js (vendored)
│   └── jszip-utils.js      # JSZip utils (vendored)
├── styles/
│   ├── style.css           # layout, toolbar, editors
│   ├── tabs.css            # tab bar and split menu
│   └── verticalNav.css     # vertical toolbar layout (toggled on demand)
├── themes/                 # 13 Monaco theme definitions
└── icon/                   # UI icons
```

## Built with

- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — the editor core
- [emmet-monaco-es](https://github.com/troy351/emmet-monaco-es) — Emmet support
- [JSZip](https://stuk.github.io/jszip/) — project export / import
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/) — file downloads
- [monaco-themes](https://github.com/brijeshb42/monaco-themes) — theme definitions

Third-party libraries are loaded from CDN; there are no local dependencies to install.

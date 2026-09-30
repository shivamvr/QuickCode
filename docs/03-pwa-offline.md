# 03 — PWA, offline, and file handling

**Size:** M · **Depends on:** 02 · **Status:** done (see Outcome)

## Why

QuickCode is a tool you would want on a plane, and it currently cannot start
without a network: monaco, emmet and JSZip all come from CDNs
([index.html:8-21](../index.html#L8-L21)). Three things follow from installing a
service worker:

1. **Offline.** Cache the monaco bundle once and the editor opens with no
   network at all.
2. **Installable.** It gets a window, an icon and a Start-menu entry instead of
   living in a browser tab.
3. **File handling.** A PWA can register as a handler for `.html`, `.css` and
   `.js`, so double-clicking one of those opens it in QuickCode. This is what
   makes item 02 feel finished.

## What changes

- New `manifest.webmanifest`
- New `sw.js` at the repo root (scope matters — it must sit at or above
  `index.html`)
- `index.html` — link the manifest, register the worker
- `scripts/index.js` — handle the `launchQueue` consumer

## Approach

**Manifest**, minimal but enough to be installable and a file handler:

```json
{
  "name": "QuickCode",
  "short_name": "QuickCode",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#1e1e1e",
  "theme_color": "#1e1e1e",
  "icons": [{ "src": "icon/favicon.png", "sizes": "192x192", "type": "image/png" }],
  "file_handlers": [{
    "action": "./index.html",
    "accept": {
      "text/html": [".html"],
      "text/css": [".css"],
      "text/javascript": [".js"]
    }
  }]
}
```

The existing `icon/favicon.png` is probably too small — installability wants at
least 192px, ideally a 512px maskable one too. Check before assuming.

**Service worker.** Precache the app shell; use stale-while-revalidate for the
CDN bundles:

```js
const SHELL = './index.html ./app.html ./scripts/... ./styles/... ./themes/...'
```

Two cautions specific to this project:

- The **theme JSON files are fetched at runtime** by
  [`settheme()`](../scripts/index.js#L297). All 19 must be cached or theme
  switching breaks offline. They are small; precache the lot.
- Monaco is loaded through its **AMD loader**, which injects further scripts
  (`editor.main.js`, `editor.main.nls.js`) and starts a **worker from a `data:`
  URL**. Cache by URL pattern against the CDN origin rather than listing files,
  and confirm the `data:` worker still starts — a service worker must not try to
  intercept it.

**File handling.** When launched by double-clicking a file:

```js
if ('launchQueue' in window) {
  launchQueue.setConsumer(async (params) => {
    if (!params.files.length) return
    const handle = params.files[0]
    const file = await handle.getFile()
    fileHandles.main = handle          // from item 02
    setPaneText('main', await file.text())
    setLang(fileExt[getExtension(file.name)])
  })
}
```

Note this hands you a real `FileSystemFileHandle`, so Ctrl+S from item 02 saves
straight back to the double-clicked file. That is the payoff.

## Verification

- DevTools → Application → Manifest shows no installability errors.
- Load once online, then go offline (DevTools → Network → Offline) and reload:
  the editor opens, syntax highlighting works, and switching to a non-`vs` theme
  still applies.
- Install it, then double-click a `.css` file on the desktop: QuickCode opens
  with that file loaded, and Ctrl+S writes back to it.
- Confirm a stale service worker does not pin an old build — bump a cache
  version constant and verify the update takes effect on second load.

## Risks

- **Service workers cache aggressively and confusingly.** Use a versioned cache
  name and delete old caches in `activate`, or you will spend an afternoon
  wondering why an edit is not showing up. During development, "Update on
  reload" in DevTools is essential.
- A service worker only registers over HTTPS or `localhost`. Fine for Live
  Server and GitHub Pages.
- File handling is Chromium-only, like item 02.
- Registering a worker changes how every future change reaches users. Worth
  doing, but it is the item most likely to cause "why am I seeing old code".

## Done when

The app opens and is fully usable with the network disabled, it installs without
manifest warnings, and double-clicking a `.js` file on an installed system opens
it in QuickCode with a working Ctrl+S.

## Outcome

**Done, September 2026.** QuickCode installs, runs with no network, and opens
files handed to it by the operating system.

### What was built

- **`manifest.webmanifest`** - standalone display, `#1e1e1e` theme and
  background, three icons, and `file_handlers` for `.html`, `.htm`, `.css`,
  `.js`, `.mjs`, `.json` and `.txt`. `launch_handler: focus-existing` so opening
  a second file reuses the window rather than spawning another.
- **`sw.js`**, precaching 41 same-origin files (the shell, all 13 themes, every
  icon) and 20 version-pinned vendor files.
- **`index.html`** links the manifest and registers the worker on `load`.
- **`scripts/index.js`** gained `openLaunchedFiles()`, the `launchQueue`
  consumer.

### The caching strategy, and why it is split

- **Same origin: network first, cache fallback.** Cache-first on the app's own
  files is the trap the plan warned about - "why am I still seeing old code".
  Falling back only on a network error or a 5xx means an update is never a
  version behind, and a dead network still opens the editor. A **404 is passed
  straight through**, because `settheme()` uses exactly that to tell a deleted
  theme from a network problem; serving a cached copy instead would undo the
  fix from the theme trim.
- **The CDNs: cache first, refreshed in the background.** Those URLs are version
  pinned (monaco 0.25.1, jszip 3.10.0), so stale is not a risk, and they are the
  entire download weight.

### Three things that were not obvious

**The monaco worker had to stop being a `data:` URL.** `getWorkerUrl` returned a
`data:` URL, which has an opaque origin - and an opaque origin is controlled by
no service worker, so the `importScripts` inside it could never come from the
cache. With no network the language workers would simply have died. It is now a
`blob:` URL, which inherits the page's origin and is controlled like anything
else.

**Monaco's lazily-loaded language modules have to be listed.** The AMD loader
fetches `htmlMode.js`, `cssMode.js`, `tsMode.js`, `jsonMode.js` and the
`basic-languages` grammars at the moment a language is first used, and the
worker fetches `htmlWorker.js`, `cssWorker.js`, `jsonWorker.js` and
`tsWorker.js` from inside itself. None of them appear in `index.html`, and all
of them are needed offline. The test suite derives the list it expects from the
live DOM, which is how the gap was found.

**The icons had to be made.** The plan guessed the existing favicon was too
small and it was: 64x64, where an install wants 192 and ideally a 512 maskable.
It is flat geometric art - a code window with a title bar and a `</>` - so it was
redrawn from shapes at 192 and 512 plus a maskable 512 on the theme colour,
rather than upscaled into something blurry. The suite reads each PNG's header
and checks its real size against what the manifest claims.

### File handling

A launched file is routed to **the pane its type belongs to** - a `.css` opens
in the css pane, not over the top of the html - and the language is switched to
html first so that pane is reachable. The handle comes through as a real
`FileSystemFileHandle`, so Ctrl+S writes back to the double-clicked file with no
further prompting. That is the payoff the plan described.

One addition to the plan: **a launch asks before replacing work that is in no
file.** The user did not choose the destination here, QuickCode did, so silently
overwriting an unsaved buffer would be the same class of data loss item 01 was
about. The explicit Open button is deliberately left silent - there the user is
looking at the editor and named the file themselves.

### Verification

`node test/run.js` - 63 checks, all passing, including a new **`offline`
scenario**: the page loads, waits for the worker to take control, tells the test
server to stop answering for everything except the suite's own endpoints, and
reloads. The editor then boots, styles itself, renders its icons and reads a
theme entirely from the cache, and an uncached URL is confirmed to fail rather
than be invented.

Checks worth knowing about:

- every URL the live DOM loaded is in the cache - so adding a script to
  `index.html` without adding it to `sw.js` fails here
- monaco's worker URL is a `blob:` one, and the CSS language service actually
  produces markers
- the manifest is installable, and each icon is really the size it claims
- a 503 on a cached file falls back to the cache, while a missing theme still
  returns 404

Mutation-checked: dropping one theme from `SHELL`, returning the `data:` worker
URL, and removing the cache fallback each turned the suite red - the last one
taking the whole offline scenario with it.

### Left for later

- **Prettier is not precached.** It is fetched through `import()` from unpkg the
  first time a format is asked for, and the service worker caches it then, so it
  works offline only if it has been used online once. Precaching ~1MB that many
  sessions never touch is the wrong trade.
- **The automated offline run blackholes this origin, not the CDNs.** The vendor
  files are asserted to be in the cache, but the run cannot prove they were
  served from it. DevTools with Network -> Offline is still the honest check
  before a release.

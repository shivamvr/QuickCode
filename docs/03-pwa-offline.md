# 03 — PWA, offline, and file handling

**Size:** M · **Depends on:** 02 · **Status:** not started

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

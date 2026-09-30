//=====================================================================
// QuickCode service worker: offline support, and the thing that makes the
// app installable.
//
// Strategy, and the reasoning behind each half:
//
//   same origin  network first, falling back to the cache. This app is edited
//                constantly and served from a static host, and cache-first on
//                its own files is the classic "why am I still seeing old code"
//                trap. Falling back only on a network error or a 5xx keeps it
//                working with no network without ever serving something stale
//                while the network is fine.
//   the CDNs     cache first, refreshed in the background. Those URLs are
//                version pinned (monaco 0.52.2, jszip 3.10.0) so stale is not a
//                risk, and they are by far the largest download.
//   anything else is left alone entirely.
//
// Bump CACHE to push every client onto a new set of files; the old cache is
// deleted on activate.
//=====================================================================

const CACHE = 'quickcode-v5'

// Everything the editor needs to start, from this origin. The theme JSON files
// are fetched at runtime by settheme(), so every one of them has to be here or
// theme switching breaks with no network. The test suite checks this list
// against what index.html actually loads, so it cannot quietly drift.
const SHELL = [
  './',
  './index.html',
  './app.html',
  './manifest.webmanifest',
  './scripts/cssEditor.js',
  './scripts/eventListener.js',
  './scripts/fileSaver.js',
  './scripts/index.js',
  './scripts/jsEditor.js',
  './scripts/preview.js',
  './scripts/share.js',
  './scripts/splitEditor.js',
  './scripts/store.js',
  './styles/style.css',
  './styles/tabs.css',
  './styles/verticalNav.css',
  './themes/AyuDark.json',
  './themes/Dracula.json',
  './themes/Eighties.json',
  './themes/Night-Blue.json',
  './themes/Night.json',
  './themes/NightOwl.json',
  './themes/OceanicNext.json',
  './themes/Solarizedark.json',
  './themes/Zenburnesque.json',
  './themes/cobalt.json',
  './themes/idleFingers.json',
  './themes/monokai.json',
  './themes/synthwave.json',
  './icon/align.svg',
  './icon/code1.svg',
  './icon/css.svg',
  './icon/download.svg',
  './icon/favicon.png',
  './icon/hide.svg',
  './icon/html.svg',
  './icon/icon-192.png',
  './icon/icon-512.png',
  './icon/icon-maskable-512.png',
  './icon/js.svg',
  './icon/open.svg',
  './icon/show.svg',
  './icon/single.svg',
  './icon/splits.svg',
]

// Version-pinned vendor code, listed because nothing can discover it: monaco's
// AMD loader fetches most of this itself, at the moment a language is first
// used, and the language workers fetch their own half from inside a worker.
// Miss one and the editor opens offline but the language it needs is dead.
const MONACO = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/'

const VENDOR = [
  MONACO + 'loader.js',
  MONACO + 'editor/editor.main.js',
  MONACO + 'editor/editor.main.css',
  MONACO + 'base/browser/ui/codicons/codicon/codicon.ttf',

  // the worker bootstrap, and the language services that run inside it
  MONACO + 'base/worker/workerMain.js',
  MONACO + 'language/html/htmlWorker.js',
  MONACO + 'language/css/cssWorker.js',
  MONACO + 'language/json/jsonWorker.js',
  MONACO + 'language/typescript/tsWorker.js',

  // loaded on the main thread the first time each language is selected
  MONACO + 'language/html/htmlMode.js',
  MONACO + 'language/css/cssMode.js',
  MONACO + 'language/json/jsonMode.js',
  MONACO + 'language/typescript/tsMode.js',
  MONACO + 'basic-languages/html/html.js',
  MONACO + 'basic-languages/css/css.js',
  MONACO + 'basic-languages/javascript/javascript.js',
  MONACO + 'basic-languages/typescript/typescript.js',

  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.0/jszip.min.js',
  'https://unpkg.com/emmet-monaco-es@5.7.0/dist/emmet-monaco.min.js',
]

const VENDOR_HOSTS = ['cdnjs.cloudflare.com', 'unpkg.com']

// unpkg answers with a redirect to a versioned url, and a redirected response
// cannot always be stored as it stands. Re-wrapping keeps the body and the
// content type under the url the app actually asks for.
const put = async (cache, key, res) => {
  try {
    await cache.put(key, res.clone())
  } catch (err) {
    const type = res.headers.get('content-type')
    await cache.put(key, new Response(await res.blob(), {
      headers: type ? { 'content-type': type } : {},
    }))
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    // the shell has to arrive in full: without it there is no offline mode
    await cache.addAll(SHELL)
    // the vendor files are best effort. One CDN hiccup during install must not
    // leave the user with no service worker at all - the next load repairs it.
    await Promise.all(VENDOR.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'reload' })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        await put(cache, url, res)
      } catch (err) {
        console.warn('[sw] could not precache', url, err.message)
      }
    }))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names
      .filter((name) => name !== CACHE && name.indexOf('quickcode-') === 0)
      .map((name) => caches.delete(name)))
    // take over the page that registered us, so the first visit is already
    // offline-capable rather than the second
    await self.clients.claim()
  })())
})

const networkFirst = async (req) => {
  const cache = await caches.open(CACHE)
  try {
    const res = await fetch(req)
    if (res.ok) {
      put(cache, req, res).catch(() => { /* a full disk must not break the page */ })
      return res
    }
    // A 404 is a real answer and has to reach the app: settheme() uses it to
    // tell a deleted theme from a network problem. Only a broken or missing
    // server falls back to what was cached.
    if (res.status < 500) return res
    throw new Error('HTTP ' + res.status)
  } catch (err) {
    const hit = await cache.match(req) || await cache.match(req, { ignoreSearch: true })
    if (hit) return hit
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html')
      if (shell) return shell
    }
    throw err
  }
}

const cacheFirst = async (req) => {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  const fresh = fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') {
      put(cache, req, res).catch(() => {})
    }
    return res
  })
  if (hit) {
    // a failed background refresh is not the page's problem
    fresh.catch(() => {})
    return hit
  }
  return fresh
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // blob: and data: never reach here, but be explicit about it
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  if (url.origin === self.location.origin) {
    // the test suite talks to its own server; caching that would be nonsense
    if (url.pathname.indexOf('/__test/') > -1) return
    event.respondWith(networkFirst(req))
    return
  }

  if (VENDOR_HOSTS.indexOf(url.hostname) > -1) {
    event.respondWith(cacheFirst(req))
  }
})

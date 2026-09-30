// Static server for the test run.
//
// Two things make it different from a plain file server:
//
//   1. Lookups are CASE SENSITIVE, even on Windows. A theme referenced as
//      "ayudark" when the file is "AyuDark.json" used to work locally and 404
//      on GitHub Pages; serving case sensitively is what catches that class of
//      bug before it ships.
//   2. It injects the seed and probe scripts into index.html / app.html as they
//      are served, so the suite always runs against the real files in the repo
//      rather than a copy that can drift.

const http = require('http')
const fs = require('fs')
const path = require('path')

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

// resolve a path only if every segment matches on disk exactly
function resolveCaseSensitive(root, urlPath) {
  const parts = urlPath.split('/').filter(Boolean)
  let current = root
  for (const part of parts) {
    let entries
    try {
      entries = fs.readdirSync(current)
    } catch (err) {
      return null
    }
    if (!entries.includes(part)) return null
    current = path.join(current, part)
  }
  return current
}

const headInject = (caseName) => `
    <script>
      window.__case = ${JSON.stringify(caseName)};
      window.__errors = [];
      window.__messages = [];
      // "ResizeObserver loop completed with undelivered notifications" is a
      // browser notice, not an app error: monaco observes its own container, so
      // any layout change can raise it. It fires unpredictably, which would make
      // every no-errors assertion flaky.
      window.__ignoredErrors = /ResizeObserver loop/;
      window.addEventListener('error', function (e) {
        if (window.__ignoredErrors.test(e.message)) return
        window.__errors.push(e.message + ' @' + String(e.filename || '?').split('/').pop() + ':' + e.lineno)
      });
      window.addEventListener('unhandledrejection', function (e) {
        window.__errors.push('unhandled rejection: ' + String(e.reason))
      });
      window.addEventListener('message', function (e) {
        window.__messages.push(String(e.data))
      });
      window.__console = [];
      var _err = console.error;
      console.error = function () {
        window.__console.push(Array.prototype.map.call(arguments, String).join(' '));
        return _err.apply(console, arguments)
      };
    </script>
    <script src="/__test/seed.js"></script>`

function instrument(html, file, caseName) {
  let out = html.replace('<head>', '<head>' + headInject(caseName))

  if (file === 'index.html') {
    // the probe must not run until monaco has booted the app
    const boot = 'require(["vs/editor/editor.main"], bootQuickCode);'
    // bootQuickCode is async: it loads the project before building any editor,
    // so the probe has to wait for it rather than for the loader
    const booted =
      'require(["vs/editor/editor.main"], function () {\n' +
      '  var probe = function () {\n' +
      '    var s = document.createElement("script"); s.src = "/__test/probe.js";\n' +
      '    document.body.appendChild(s);\n' +
      '  };\n' +
      '  bootQuickCode().then(probe, function (err) {\n' +
      '    window.__errors.push("boot failed: " + ((err && err.message) || err));\n' +
      '    probe();\n' +
      '  });\n' +
      '});'
    if (!out.includes(boot)) {
      throw new Error('index.html boot call not found - update test/serve.js')
    }
    out = out.replace(boot, booted)
  } else {
    // app.html: inject before the LAST </body>. An earlier one appears inside a
    // JavaScript string in buildDoc(), and injecting there silently corrupts it.
    const i = out.lastIndexOf('</body>')
    if (i < 0) throw new Error('app.html has no </body>')
    out = out.slice(0, i) + '<script src="/__test/probe.js"></script>\n  ' + out.slice(i)
  }
  return out
}

function createServer({ root, onReport }) {
  // The offline scenario needs the app's own origin to stop answering while the
  // page stays open, which is what proves the service worker is serving the
  // whole app from its cache. The suite's own endpoints keep working, or the
  // probe could not report what it found.
  let offline = false

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const pathname = decodeURIComponent(url.pathname)

    if (pathname === '/__test/offline' || pathname === '/__test/online') {
      offline = pathname.endsWith('offline')
      res.writeHead(204)
      res.end()
      return
    }

    if (offline && !pathname.startsWith('/__test/')) {
      res.writeHead(503)
      res.end('offline')
      return
    }

    // one url the service worker should fall back to the cache for, without
    // taking the whole server down
    if (url.searchParams.has('__fail')) {
      res.writeHead(503)
      res.end('deliberate failure')
      return
    }

    if (req.method === 'POST' && pathname === '/__test/report') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        try {
          onReport(JSON.parse(body))
        } catch (err) {
          onReport({ case: 'unknown', results: [{ name: 'report parse', pass: false, detail: String(err) }] })
        }
        res.writeHead(204)
        res.end()
      })
      return
    }

    // the suite's own files live outside the app
    if (pathname.startsWith('/__test/')) {
      const file = path.join(__dirname, path.basename(pathname))
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404)
          res.end('not found')
          return
        }
        res.writeHead(200, { 'Content-Type': TYPES['.js'] })
        res.end(data)
      })
      return
    }

    const wanted = pathname === '/' ? '/index.html' : pathname
    const full = resolveCaseSensitive(root, wanted)
    if (!full) {
      res.writeHead(404)
      res.end('not found')
      return
    }

    const base = path.basename(full)
    if (base === 'index.html' || base === 'app.html') {
      let html
      try {
        html = instrument(fs.readFileSync(full, 'utf8'), base, url.searchParams.get('case') || '')
      } catch (err) {
        res.writeHead(500)
        res.end(String(err.message))
        return
      }
      res.writeHead(200, { 'Content-Type': TYPES['.html'] })
      res.end(html)
      return
    }

    fs.readFile(full, (err, data) => {
      if (err) {
        res.writeHead(404)
        res.end('not found')
        return
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream' })
      res.end(data)
    })
  })

  server.setOffline = (value) => { offline = value }
  return server
}

module.exports = { createServer }

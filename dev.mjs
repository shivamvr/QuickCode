// Local dev server. Not part of the site - QuickCode is static files and any
// file server will serve it.
//
// The one thing a file server cannot do is /api/ai, because that is a
// serverless function that holds the Groq key. Served as plain files the AI
// features report "there is no AI endpoint here", which is correct but not
// testable. This serves the files AND runs netlify/functions/ai.mjs in process,
// so the AI features behave exactly as they do deployed.
//
//   node dev.mjs          then open http://localhost:8080
//
// The key comes from .env, which is gitignored. With no key the AI features say
// the site has none - also worth seeing once.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 8080)

// Loopback only. Without a host argument node listens on every interface, and
// this process has a Groq key in it - there is no reason for anyone else on the
// network to be able to reach it.
//
// BOTH loopbacks, because on Windows "localhost" usually resolves to ::1 before
// 127.0.0.1. Binding only the v4 address still loads the page - browsers retry
// the other family for a document - but fetch() does not reliably do the same,
// so /api/ai failed while the site around it worked. Each address is bound
// separately rather than with '::', which would also accept the whole network.
const HOSTS = ['127.0.0.1', '::1']

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

// .env parsed the small way: KEY=value lines and # comments, nothing else. A
// variable already in the real environment wins, so running this somewhere that
// has its own configuration does not get overridden by a stale file.
function loadEnv() {
  let text = ''
  try {
    text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
  } catch (err) {
    return []
  }
  const names = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const name = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!value) continue
    if (process.env[name] === undefined) process.env[name] = value
    names.push(name)
  }
  return names
}

// Case sensitive on purpose, matching test/serve.js: a file referenced with the
// wrong case works on Windows and 404s once deployed, and that is a bug worth
// finding here rather than there.
function resolveCaseSensitive(urlPath) {
  const parts = urlPath.split('/').filter(Boolean)
  let current = ROOT
  for (const part of parts) {
    if (part === '..') return null
    // .env lives in this folder and holds the key. Nothing in the site asks for
    // a dotfile, so refusing all of them costs nothing and closes the hole.
    if (part.startsWith('.')) return null
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

const readBody = (req) => new Promise((resolve) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => resolve(Buffer.concat(chunks)))
})

const found = loadEnv()
const hasKey = Boolean(process.env.GROQ_API_KEY)

const aiModule = await import(pathToFileURL(path.join(ROOT, 'netlify', 'functions', 'ai.mjs')).href)
// The function declares its own route, so there is one place that decides it
const AI_PATH = (aiModule.config && aiModule.config.path) || '/api/ai'

async function runFunction(req, res) {
  const body = await readBody(req)
  // Only the headers the function reads. Node hands over hop-by-hop headers
  // like connection, which the Request constructor refuses.
  const headers = {}
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']

  const request = new Request('http://localhost:' + PORT + req.url, {
    method: req.method,
    headers: headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  })

  let response = null
  try {
    response = await aiModule.default(request, {})
  } catch (err) {
    console.log('  ' + req.method + ' ' + AI_PATH + ' -> the function threw: ' + err.message)
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'The function threw: ' + err.message }))
    return
  }

  const text = await response.text()
  const out = {}
  response.headers.forEach((value, name) => { out[name] = value })
  console.log('  ' + req.method + ' ' + AI_PATH + ' -> ' + response.status + ' (' + text.length + ' bytes)')
  res.writeHead(response.status, out)
  res.end(text)
}

const handler = (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const pathname = decodeURIComponent(url.pathname)

  if (pathname === AI_PATH) {
    runFunction(req, res)
    return
  }

  const wanted = pathname === '/' ? '/index.html' : pathname
  const full = resolveCaseSensitive(wanted)
  if (!full || !fs.statSync(full).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found: ' + pathname)
    return
  }

  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('not found')
      return
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(full)] || 'application/octet-stream',
      // the service worker caches aggressively; dev should always see the file
      'cache-control': 'no-store',
    })
    res.end(data)
  })
}

// Resolves to the address if it bound, or null. A machine with IPv6 switched
// off should still work, so a failure on one family is reported and skipped
// rather than thrown.
const listenOn = (host) => new Promise((resolve) => {
  const server = http.createServer(handler)
  server.on('error', (err) => {
    console.log('  not listening on ' + host + ': ' + err.code)
    resolve(null)
  })
  server.listen(PORT, host, () => resolve(host))
})

const bound = (await Promise.all(HOSTS.map(listenOn))).filter(Boolean)

if (!bound.length) {
  console.error('Could not listen on port ' + PORT + '. Something else may have it.')
  console.error('Try another: PORT=8081 node dev.mjs')
  process.exit(1)
}

console.log('QuickCode on http://localhost:' + PORT)
console.log('  bound: ' + bound.join(', '))
console.log('  ' + AI_PATH + ' -> netlify/functions/ai.mjs')
if (found.length) console.log('  .env supplied: ' + found.join(', ') + ' (values not shown)')
console.log(hasKey
  ? '  GROQ_API_KEY is set, so the AI features should answer.'
  : '  No GROQ_API_KEY - the AI features will say the site has none.')

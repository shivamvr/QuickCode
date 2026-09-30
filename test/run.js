#!/usr/bin/env node
//
//   node test/run.js
//
// Starts a case-sensitive static server over the repo, drives headless Chrome
// through a handful of scenarios, and exits non-zero if any assertion failed.
// No dependencies, no install step.
//
// Set CHROME=/path/to/chrome to override browser discovery.

const { spawn } = require('child_process')
const fs = require('fs')
const zlib = require('zlib')
const os = require('os')
const path = require('path')
const { createServer } = require('./serve')

const ROOT = path.join(__dirname, '..')
const PORT = Number(process.env.PORT || 8399)
// generous because the offline case has to install a service worker first,
// which precaches about 2MB from two CDNs before the case can even start
const CASE_TIMEOUT_MS = 120000

// The persistence case reloads the page itself rather than relying on a second
// browser process: killing Chrome can discard localStorage before it reaches
// disk, and "survives a reload" is the behaviour that actually matters anyway.
// A share link built here rather than in the browser, with node's own deflate.
// That is the point of it: if the format were something only Chrome round-trips
// with itself, this link would not open. The probe knows these same values -
// keep the two in step.
const SHARED = {
  v: 1,
  name: 'Fizz buzz',
  code: '<h1>hej v\u00e4rlden \ud83d\ude00</h1>',
  css: 'h1 { color: rebeccapurple }',
  js: 'console.log("delad \u00e5\u00e4\u00f6")',
  lang: 'html',
  cssOn: true,
  jsOn: false,
}

const SHARE_HASH = '#s=' + zlib.deflateRawSync(Buffer.from(JSON.stringify(SHARED), 'utf8'))
  .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// The offline case goes last: it takes the server down mid-run, and the probe
// puts it back only by finishing.
const SCENARIOS = [
  { name: 'core', page: 'index.html', profile: 'core' },
  { name: 'persist', page: 'index.html', profile: 'persist' },
  { name: 'migrate', page: 'index.html', profile: 'migrate' },
  { name: 'share', page: 'index.html', profile: 'share', hash: SHARE_HASH },
  { name: 'preview-safe', page: 'app.html', profile: 'preview' },
  { name: 'offline', page: 'index.html', profile: 'offline' },
]

function findChrome() {
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c
    } catch (err) { /* keep looking */ }
  }
  return null
}

function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    try { child.kill('SIGKILL') } catch (err) { /* already gone */ }
  }
}

function runCase(chrome, scenario, tmpDir, pending) {
  return new Promise((resolve) => {
    const profileDir = path.join(tmpDir, 'profile-' + scenario.profile)
    const url = `http://localhost:${PORT}/${scenario.page}?case=${scenario.name}` +
      (scenario.hash || '')

    const child = spawn(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--user-data-dir=' + profileDir,
      url,
    ], { stdio: 'ignore' })

    let settled = false
    const finish = (report) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      // Chrome holds a lock on the profile directory, and the next scenario may
      // reuse it, so wait for the process to actually go away before resolving.
      const done = () => resolve(report)
      const guard = setTimeout(done, 5000)
      child.once('exit', () => { clearTimeout(guard); done() })
      killTree(child)
    }

    pending.set(scenario.name, finish)

    const timer = setTimeout(() => {
      finish({
        case: scenario.name,
        results: [{ name: 'case completed', pass: false, detail: 'timed out after ' + CASE_TIMEOUT_MS + 'ms' }],
      })
    }, CASE_TIMEOUT_MS)

    child.on('error', (err) => {
      finish({
        case: scenario.name,
        results: [{ name: 'browser launched', pass: false, detail: String(err.message) }],
      })
    })
  })
}

async function main() {
  const chrome = findChrome()
  if (!chrome) {
    console.error('Could not find Chrome or Edge. Set CHROME=/path/to/chrome and retry.')
    process.exit(2)
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quickcode-test-'))
  const pending = new Map()

  const server = createServer({
    root: ROOT,
    onReport: (report) => {
      const finish = pending.get(report.case)
      if (finish) finish(report)
    },
  })

  await new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(PORT, resolve)
  })

  console.log('QuickCode test suite')
  console.log('  browser: ' + chrome)
  console.log('  serving: ' + ROOT + '  (case sensitive)')
  console.log('')

  let failed = 0
  let passed = 0

  for (const scenario of SCENARIOS) {
    server.setOffline(false)        // whatever the previous case did to it
    const report = await runCase(chrome, scenario, tmpDir, pending)
    console.log(scenario.name)
    for (const r of report.results || []) {
      const mark = r.pass ? '  PASS  ' : '  FAIL  '
      console.log(mark + r.name)
      if (r.detail) console.log('          ' + r.detail)
      r.pass ? passed++ : failed++
    }
    console.log('')
  }

  server.close()
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (err) { /* chrome may still hold a lock */ }

  console.log(failed === 0
    ? `all ${passed} checks passed`
    : `${failed} failed, ${passed} passed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})

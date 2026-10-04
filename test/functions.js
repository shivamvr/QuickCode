//=====================================================================
// The ai function, checked in node.
//
// The browser suite cannot reach it: it runs on the host, holds the key, and is
// the one piece of QuickCode that is not a static file. So it is imported here
// and called directly, with fetch replaced - which means these checks need no
// key, no network, and no part of the shared allowance.
//
// What matters most is the thing that is easy to get wrong and invisible when it
// is: that the status code survives the trip. Groq's 429 and its 401 mean
// completely different things to whoever is reading the console, and flattening
// them into a 500 would leave the app with nothing useful to say.
//=====================================================================

import { pathToFileURL } from 'node:url'
import path from 'node:path'

const results = []
const check = (name, fn) => {
  try {
    const outcome = fn()
    results.push({ name, pass: Boolean(outcome.pass), detail: outcome.detail })
  } catch (err) {
    results.push({ name, pass: false, detail: 'threw: ' + (err && err.message) })
  }
}
const ok = (pass, detail) => ({ pass, detail })

const FUNCTION = pathToFileURL(path.resolve('netlify/functions/ai.mjs')).href

// What Groq would have said, without Groq.
const groqAnswering = (status, body) => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }
  return calls
}

const post = (handler, body) => handler(new Request('https://example.test/api/ai', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}), {})

export async function runFunctionChecks() {
  const realFetch = globalThis.fetch
  const realKey = process.env.GROQ_API_KEY
  const handler = (await import(FUNCTION)).default

  // ------------------------------------------------- it forwards properly
  process.env.GROQ_API_KEY = 'test-key-not-a-real-one'
  let calls = groqAnswering(200, { choices: [{ message: { content: 'the answer' } }] })
  let response = await post(handler, { system: 'be brief', question: 'why' })
  let payload = await response.json()

  check('the function answers with the text the model gave', () => ok(
    response.status === 200 && payload.text === 'the answer',
    response.status + ' ' + JSON.stringify(payload)))

  check('the key goes to groq and never comes back to the browser', () => {
    const sent = calls[0] || {}
    const headers = (sent.options && sent.options.headers) || {}
    return ok(
      String(sent.url).indexOf('api.groq.com') > -1 &&
      headers.authorization === 'Bearer test-key-not-a-real-one' &&
      JSON.stringify(payload).indexOf('test-key') === -1,
      'sent to ' + sent.url + '; the reply mentions the key=' +
      (JSON.stringify(payload).indexOf('test-key') > -1))
  })

  check('the question is passed on as a system and a user message', () => {
    const body = JSON.parse(((calls[0] || {}).options || {}).body || '{}')
    return ok(
      body.messages.length === 2 &&
      body.messages[0].role === 'system' && body.messages[0].content === 'be brief' &&
      body.messages[1].role === 'user' && body.messages[1].content === 'why' &&
      typeof body.model === 'string' && body.model.length > 0,
      JSON.stringify(body).slice(0, 160))
  })

  // --------------------------------------- the status survives the trip
  calls = groqAnswering(429, { error: { message: 'Rate limit reached' } })
  response = await post(handler, { question: 'why' })
  payload = await response.json()
  check('a spent allowance comes back as 429, not as a 500', () => ok(
    response.status === 429 && /Rate limit/.test(payload.error || ''),
    response.status + ' ' + JSON.stringify(payload)))

  calls = groqAnswering(401, { error: { message: 'Invalid API Key' } })
  response = await post(handler, { question: 'why' })
  check('a refused key comes back as 401, so the app can say whose problem it is', () => ok(
    response.status === 401, 'status ' + response.status))

  // ------------------------------------------------ what it refuses to do
  globalThis.fetch = async () => { throw new TypeError('network down') }
  response = await post(handler, { question: 'why' })
  check('a dead upstream is a 502 rather than an exception', () => ok(
    response.status === 502, 'status ' + response.status))

  calls = groqAnswering(200, { choices: [] })
  response = await post(handler, { question: 'x'.repeat(30000) })
  check('too much text is refused before it is forwarded', () => ok(
    response.status === 413 && calls.length === 0,
    'status ' + response.status + ', forwarded ' + calls.length + ' times'))

  calls = groqAnswering(200, { choices: [] })
  response = await post(handler, { question: '' })
  check('an empty question is refused before it is forwarded', () => ok(
    response.status === 400 && calls.length === 0,
    'status ' + response.status + ', forwarded ' + calls.length + ' times'))

  calls = groqAnswering(200, { choices: [] })
  response = await post(handler, 'not json at all')
  check('a body that is not json is refused', () => ok(
    response.status === 400 && calls.length === 0, 'status ' + response.status))

  calls = groqAnswering(200, { choices: [] })
  response = await handler(new Request('https://example.test/api/ai', { method: 'GET' }), {})
  check('a GET is turned away', () => ok(
    response.status === 405 && calls.length === 0, 'status ' + response.status))

  // ------------------------------------------- no key configured at all
  delete process.env.GROQ_API_KEY
  calls = groqAnswering(200, { choices: [] })
  response = await post(handler, { question: 'why' })
  payload = await response.json()
  check('with no key configured it says so, and says whose job it is', () => ok(
    response.status === 503 && /GROQ_API_KEY/.test(payload.error || '') &&
    /your site/.test(payload.error || '') && calls.length === 0,
    response.status + ' ' + JSON.stringify(payload)))

  globalThis.fetch = realFetch
  if (realKey === undefined) delete process.env.GROQ_API_KEY
  else process.env.GROQ_API_KEY = realKey

  return results
}

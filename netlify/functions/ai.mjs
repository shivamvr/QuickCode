//=====================================================================
// The one part of QuickCode that is not a static file.
//
// It exists for a single reason: the API key must not be in the browser. A
// static site has nowhere to hide a secret, so this runs on the host instead,
// reads the key from its environment, and forwards the question to Groq. The
// browser never sees the key and has nothing to leak.
//
// Three things it is careful about:
//
//   1. It passes the status code through. Groq's 429 means "the shared
//      allowance is spent today" and its 401 means "the site owner's key is
//      wrong" - two completely different things to tell someone. Flattening
//      both into a 500 would leave the app with nothing useful to say, which is
//      the whole point of showing a message at all.
//
//   2. It never logs a request body. People's code passes through here.
//
//   3. It caps the size. A question is a few thousand characters; anything
//      larger is either a mistake or someone using this as a free relay.
//
// Written in the web-standard Request/Response shape, so moving it to Vercel is
// a file move to api/ai.mjs and nothing else. The path below is why: /api/ai is
// what both hosts serve it at.
//=====================================================================

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Chosen here rather than in the browser, so the model can change without
// touching the site - which is the whole point, because model names expire.
// llama-3.3-70b-versatile was in Groq's documentation and had already been
// withdrawn by the time a real key was pointed at it, so this one was picked
// from a live GET of /openai/v1/models and then tried on both prompts.
//
// If this ever starts answering with "the model has been renamed or withdrawn",
// that is what has happened again: list the models and put a current one here.
const MODEL = 'openai/gpt-oss-120b'

const MAX_CHARS = 24000

// This model reasons before it answers, and the thinking is charged against the
// same budget as the reply - a practice problem spent 910 tokens thinking and
// 384 saying. 3000 leaves room for a problem that needs markup and css too.
const MAX_TOKENS = 3000

// Same-origin in the normal case, so these do nothing. They are here so the
// site still works if it is ever served from somewhere other than the function.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const reply = (status, body) => new Response(JSON.stringify(body), {
  status: status,
  headers: Object.assign({ 'content-type': 'application/json' }, CORS),
})

// Netlify and Vercel both put it on process.env; Netlify also has its own
// accessor, and Cloudflare would pass it on the context. Tried in that order so
// one file works wherever it lands.
const readKey = (context) => {
  try {
    if (typeof process !== 'undefined' && process.env && process.env.GROQ_API_KEY) {
      return process.env.GROQ_API_KEY
    }
  } catch (err) { /* no process here */ }
  try {
    if (typeof Netlify !== 'undefined' && Netlify.env) return Netlify.env.get('GROQ_API_KEY') || ''
  } catch (err) { /* not netlify */ }
  if (context && context.env && context.env.GROQ_API_KEY) return context.env.GROQ_API_KEY
  return ''
}

export default async (req, context) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'This endpoint takes a POST.' })

  const key = readKey(context)
  if (!key) {
    // The person reading this cannot fix it, so say whose problem it is.
    return reply(503, { error: 'This site has no GROQ_API_KEY set, so AI is switched off. If it is your site, add one in the host environment variables.' })
  }

  let asked = null
  try {
    asked = await req.json()
  } catch (err) {
    return reply(400, { error: 'That request was not JSON.' })
  }

  const system = String((asked && asked.system) || '')
  const question = String((asked && asked.question) || '')
  if (!question) return reply(400, { error: 'Nothing was asked.' })
  if (system.length + question.length > MAX_CHARS) {
    return reply(413, { error: 'That is too much to send at once. Trim the code and ask again.' })
  }

  let response = null
  try {
    response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + key,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.4,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: question },
        ],
      }),
    })
  } catch (err) {
    return reply(502, { error: 'The server could not reach Groq.' })
  }

  const raw = await response.text()
  let data = {}
  try {
    data = JSON.parse(raw)
  } catch (err) {
    data = {}
  }

  if (!response.ok) {
    // Forwarded, not flattened - see rule 1 at the top.
    const said = (data.error && data.error.message) || ''
    return reply(response.status, { error: String(said).slice(0, 300), from: 'groq' })
  }

  const choice = (data.choices || [])[0] || {}
  const text = (choice.message && choice.message.content) || ''
  return reply(200, { text: text })
}

export const config = { path: '/api/ai' }

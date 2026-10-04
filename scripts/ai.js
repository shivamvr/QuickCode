//=====================================================================
// Asking a model for something.
//
// The key is NOT here. QuickCode is static files with nowhere to hide a secret,
// so the key lives in the host's environment variables and a small function
// forwards the question to Groq - see netlify/functions/ai.mjs. The browser
// holds nothing worth stealing, which is why there is no key dialog, no key in
// localStorage, and nothing to keep out of a share link.
//
// Two rules hold this file together:
//
//   1. Whatever went wrong gets shown. A spent allowance, a key the owner needs
//      to fix, a model that has been renamed and a host that is down are four
//      different messages, and the function passes the status through so they
//      can stay four different messages.
//
//   2. askModel is the one seam. Above it is building a question, below it is
//      the network. The tests replace it, so both sides are checked without a
//      key, without a network, and without spending the shared allowance.
//=====================================================================

// Same origin, so there is no CORS to negotiate and no url to configure. Both
// Netlify and Vercel serve the function here.
const AI_ENDPOINT = '/api/ai'

// What the request would be, as a plain object, so a test can read it without
// sending it. There is no key in it - that is the point of the whole design.
const aiRequestFor = (system, question) => ({
  url: AI_ENDPOINT,
  headers: { 'content-type': 'application/json' },
  body: { system: system, question: question },
})

async function callModel(system, question) {
  const request = aiRequestFor(system, question)
  let response = null
  try {
    response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
    })
  } catch (err) {
    const problem = new Error(String((err && err.message) || err))
    problem.unreachable = true
    throw problem
  }

  const raw = await response.text()
  let data = null
  try {
    data = JSON.parse(raw)
  } catch (err) {
    data = null
  }
  if (!response.ok) {
    const problem = new Error(String((data && data.error) || raw || '').slice(0, 300))
    problem.status = response.status
    // A 404 from the function means groq has withdrawn the model. A 404 with no
    // reply of ours in it means there is no function there at all, which is what
    // running the static files on their own looks like. Different problems,
    // different people to tell.
    problem.noEndpoint = response.status === 404 && !data
    throw problem
  }
  return String((data && data.text) || '')
}

// The seam. Everything above it is a question and everything below it is an
// answer, so the tests can replace this and check both sides.
let askModel = (system, question) => callModel(system, question)

// Every one of these is something different, and someone reading it can only
// act on it if it says which. A spent allowance is wait; a refused key is the
// owner's job; too much code is trim it and ask again.
const aiFailure = (err) => {
  const status = err && err.status
  const said = String((err && err.message) || err)
  if (err && err.unreachable) {
    if (!navigator.onLine) {
      return 'you appear to be offline. This is the one thing here that needs a network.'
    }
    // The request never got a reply at all, so there is no status to go on. Name
    // the address it tried: "did not answer" on its own sent an hour down the
    // wrong path once, when the real answer was that the page was open on a
    // different port from the one serving the function.
    return 'the server did not answer. Nothing is serving ' + location.origin + AI_ENDPOINT +
      ' - check the page is open on the port that is running the function, and locally that it ' +
      'was started with "node dev.mjs" rather than a plain file server.'
  }
  if (status === 429) {
    return "today's shared allowance is used up. It resets tomorrow - or run your own copy with your own key."
  }
  if (status === 401 || status === 403) {
    return 'the key on the server was refused. Nothing you can fix - tell whoever runs this site.'
  }
  if (status === 503) return said || 'AI is switched off on this site.'
  if (err && err.noEndpoint) {
    return 'there is no AI endpoint here. The site is being served as plain files, without the ' +
      'function that holds the key - see netlify/functions/ai.mjs.'
  }
  if (status === 404) {
    return 'the model has been renamed or withdrawn. Nothing you can fix - tell whoever runs this site.'
  }
  if (status === 413) return said || 'that is too much code to send at once. Trim it and ask again.'
  if (status === 400) return said || 'the request was refused.'
  if (status >= 500) return 'the server had a problem (' + status + ').' + (said ? ' ' + said : '')
  return said || 'it did not work, and said nothing about why.'
}

//------------------------- saying so in the console -------------------

let aiBusy = false

function beginAiRow(message) {
  const out = consoleRows()
  if (!out) return null
  const placeholder = out.querySelector('.logEmpty')
  if (placeholder) placeholder.remove()
  const row = document.createElement('div')
  row.className = 'logRow log-ai'
  row.textContent = message
  out.appendChild(row)
  out.scrollTop = out.scrollHeight
  return row
}

function setAiRow(row, text) {
  if (!row) return
  // textContent, never innerHTML: an answer from a model is not markup this
  // project wrote, and the console already holds to that for the snippet's own
  // output.
  row.textContent = text
  const out = consoleRows()
  if (out) out.scrollTop = out.scrollHeight
}

//--------------------------- explain an error -------------------------

const AI_EXPLAIN_SYSTEM = [
  'You are helping someone debug a small snippet in a browser code playground.',
  'They write three files - html, css, and javascript or typescript - which run together',
  'in a sandboxed iframe. Imports of npm packages are resolved to a CDN, so they work.',
  'Explain the error they ask about: what it means, why it happened in their code, and the',
  'smallest change that fixes it. Be specific about their code rather than general, and quote',
  'the line you mean. Keep it short: a few sentences and then the fix.',
  'Plain prose and small code snippets. No headings, no preamble, no restating the question.',
].join(' ')

// How much of a pane to send. A playground snippet is small; this is here so a
// pasted-in library cannot turn one question into a huge request.
const AI_MAX_LINES = 400

// The line the error is on gets an arrow, so there is no ambiguity about which
// line is meant. Numbers are the pane's own, which is what makes them useful -
// they are the numbers the editor is showing.
const numberedLines = (text, hot) => {
  const all = String(text || '').split('\n')
  const kept = all.slice(0, AI_MAX_LINES)
  const body = kept.map((line, index) => {
    const n = index + 1
    return (n === hot ? '>' : ' ') + String(n) + ' | ' + line
  }).join('\n')
  return all.length > kept.length
    ? body + '\n  ... ' + (all.length - kept.length) + ' more lines'
    : body
}

const AI_PANE_TITLES = { main: 'html', css: 'css', js: 'javascript' }

// One name per pane for the whole question. The console's own tag is shorter
// ("js:3"), and using both spellings would have the prompt point at "the js
// pane" and then label the listing "the javascript pane" - the same file under
// two names, in a question about which line is wrong.
const aiPaneTitle = (id, fallback) => {
  if (id === 'js') return usingTypeScript() ? 'typescript' : 'javascript'
  return AI_PANE_TITLES[id] || fallback || 'editor'
}

// Everything known about the problem, which is a good deal more than the
// message: which pane it came from, which line of that pane, and the code.
const explainPrompt = (problem) => {
  const parts = []
  parts.push('This error appeared in the console:')
  parts.push('')
  parts.push('    ' + problem.message)
  parts.push('')

  const where = aiPaneTitle(problem.paneId, problem.pane)
  if (problem.paneId && problem.line) {
    parts.push('It is reported at line ' + problem.line + ' of the ' + where +
      ' pane, marked with > below.')
  } else if (problem.paneId) {
    parts.push('It is reported in the ' + where + ' pane.')
  } else {
    parts.push('The console could not say which line it came from.')
  }
  parts.push('')

  TAB_IDS.forEach((id) => {
    const text = contentOf(id)
    if (!text.trim()) return
    parts.push('--- the ' + aiPaneTitle(id) + ' pane ---')
    parts.push(numberedLines(text, id === problem.paneId ? problem.line : 0))
    parts.push('')
  })

  return parts.join('\n')
}

// One at a time. Two answers writing into the console at once would interleave,
// and the second question is nearly always the same as the first.
async function explainError(problem) {
  if (aiBusy) return
  aiBusy = true
  const row = beginAiRow('thinking...')
  try {
    const answer = await askModel(AI_EXPLAIN_SYSTEM, explainPrompt(problem))
    setAiRow(row, String(answer || '').trim() || 'Nothing came back about that one.')
  } catch (err) {
    setAiRow(row, 'Could not ask: ' + aiFailure(err))
  } finally {
    aiBusy = false
  }
}

//=====================================================================
// Practice problems, written into the editor.
//
// Ask for a topic and a new project appears holding a problem: the statement as
// a comment, a stub to fill in, and test calls whose results land in the
// console. The console is the test runner - it already reports with the line
// numbers the editor is showing, so nothing new had to be built for that.
//
// Three decisions worth knowing:
//
//   1. It always makes a NEW project. Nothing you are working on is touched, and
//      the project picker becomes the list of problems you have been set.
//
//   2. A problem may use all three panes. "Build a debounce visualiser" needs
//      markup and css; "two sum" does not. The model is told to use them only
//      when the problem genuinely calls for it.
//
//   3. The reply is parsed forgivingly. A model asked for JSON will sometimes
//      wrap it in a code fence, or say "here you go" first. None of that is
//      worth failing over, and a problem that arrives as plain javascript is
//      still a problem - so the fallback is to treat the whole reply as the js
//      pane rather than to show an error.
//=====================================================================

const PROBLEM_SYSTEM = [
  'You set programming practice problems for someone using a browser playground with three',
  'files: html, css and javascript. The javascript runs after the markup, and anything it logs',
  'appears in a console under the preview.',
  '',
  'Answer with a single JSON object and nothing else. No code fence, no commentary. Shape:',
  '{"name": "...", "js": "...", "html": "...", "css": "..."}',
  '',
  '- name: the problem, four words at most, e.g. "Two Sum" or "Debounce Visualiser".',
  '- js: the problem statement as a // comment block at the top - what to do, the constraints,',
  '  and a worked example - then a function stub with an empty body for them to fill in, then a',
  '  few test calls. Define a small check(actual, expected) helper yourself that compares with',
  '  JSON.stringify and logs "PASS" or "FAIL - got X, wanted Y", and call it on each case.',
  '  Do NOT solve the problem: the stub body must be left empty apart from a // your code here',
  '  comment.',
  '- html and css: only if the problem genuinely needs them, such as anything visual or',
  '  interactive. For a pure algorithm problem send them as empty strings.',
  '',
  'Keep the whole thing short enough to read in one screen. Valid JSON: escape the newlines in',
  'the string values.',
].join('\n')

// What was asked for, or anything at all.
const problemQuestion = (wanted) => {
  const asked = String(wanted || '').trim()
  return asked
    ? 'Set me a problem about: ' + asked
    : 'Set me any problem, at a difficulty somewhere in the middle. Pick the topic yourself.'
}

//---------------------------- reading the reply ------------------------

// Code fences come off first, and off BOTH paths below. The json path would
// cope without this - the braces are found from the outside in, so a fence
// around them falls away along with any other prose - but the fallback path
// keeps the text as it stands, and fences left in it end up in the editor.
const withoutFences = (reply) => String(reply || '').replace(/```[a-z]*\n?/gi, '')

// A preamble, a sign-off, a fence: all common, none worth failing over.
const unwrapJson = (text) => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch (err) {
    return null
  }
}

// Always returns something usable. A reply that is not JSON at all is still
// most likely a problem written as javascript, which is worth keeping.
const parseProblem = (reply) => {
  const text = withoutFences(reply)
  const found = unwrapJson(text)
  if (found && (found.js || found.html)) {
    return {
      name: String(found.name || 'Practice problem').slice(0, 60),
      code: String(found.html || ''),
      css: String(found.css || ''),
      js: String(found.js || ''),
      parsed: true,
    }
  }
  return {
    name: 'Practice problem',
    code: '',
    css: '',
    js: text.trim(),
    parsed: false,
  }
}

//---------------------------- setting it up ---------------------------

// A message nobody sees is not a message. On the way to a new project the
// preview gets opened anyway, but a request that failed never gets there - so
// the console is brought into view before the bad news is written into it.
function showAiTrouble(row, message) {
  if (!previewShowing()) splitMenu('preview')
  setAiRow(row, message)
}

// Opens on the preview with the console showing, because the first thing anyone
// does with a problem is run it.
const problemSettings = (problem) => Object.assign({}, PROJECT_SETTINGS, {
  lang: 'html',
  tab: 'js',
  js: Boolean(problem.js),
  css: Boolean(problem.css),
  split: true,
  splitLang: 'preview',
})

async function newAiProblem() {
  if (aiBusy) return null
  const wanted = await askText('What should the problem be about?\n\n' +
    'A topic, a difficulty, or both - "binary trees, medium", "array methods", ' +
    '"something visual". Leave it empty for anything.', '')
  if (wanted === null) return null         // cancelled: set nothing

  aiBusy = true
  const row = beginAiRow('writing a problem...')
  try {
    const reply = await askModel(PROBLEM_SYSTEM, problemQuestion(wanted))
    const problem = parseProblem(reply)
    if (!problem.js.trim() && !problem.code.trim()) {
      showAiTrouble(row, 'Nothing usable came back. Try asking again.')
      return null
    }
    const record = makeProject({
      name: problem.name,
      code: problem.code,
      css: problem.css,
      js: problem.js,
      settings: problemSettings(problem),
    })
    await saveProject(record)
    await openRecord(record)
    await refreshProjects()
    setAiRow(row, problem.parsed
      ? 'Set: ' + problem.name + '. Press run when you have had a go.'
      : 'Set: ' + problem.name + '. The reply was not quite the shape asked for, so all of ' +
        'it went into the js pane.')
    return record
  } catch (err) {
    showAiTrouble(row, 'Could not ask: ' + aiFailure(err))
    return null
  } finally {
    aiBusy = false
  }
}

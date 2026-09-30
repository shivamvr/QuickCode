//=====================================================================
// TypeScript in the js pane.
//
// The plan for this reached for esbuild-wasm. It is not needed: monaco already
// ships the TypeScript compiler, and item 09 already precaches its worker. So
// there is no new download, it works offline on the first try, and the type
// errors come along for free - getEmitOutput for the javascript, the diagnostic
// lists for the complaints.
//
// Two things this file is careful about:
//
//   1. It compiles from a throwaway model, not from the pane's own. The pane
//      may not have been created yet, and a compile must not depend on whether
//      the user has clicked a tab. Every model made here is disposed here.
//
//   2. Stripping types removes lines, so an error on line 9 of the generated
//      javascript is not line 9 of what was written. The emitted source map is
//      decoded far enough to say which line it really was. Guessing is not an
//      option: the console showing a confidently wrong line number is worse
//      than it showing none, which is the rule preview.js already follows.
//=====================================================================

const JS_FLAVOURS = ['javascript', 'typescript']

// what app.html reads when the pane it cannot compile is a TypeScript one
const COMPILED_KEY = 'quickcodeCompiled'

const usingTypeScript = () => quickEdit.jsLang === 'typescript'

// Emit as something a browser of this age runs directly, and ask for the map
// that rule 2 above needs. Left alone: the type checking itself, which is
// monaco's own default and is what the editor already underlines.
function configureTypeScript() {
  const ts = monaco.languages.typescript
  ts.typescriptDefaults.setCompilerOptions(Object.assign(
    {}, ts.typescriptDefaults.getCompilerOptions(), {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      sourceMap: true,
      allowNonTsExtensions: true,
    }))
}

//----------------------- the source map, line only -------------------

const VLQ_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Base64 VLQ: six bits a character, the top one saying another follows, and the
// lowest bit of the assembled number carrying the sign.
function decodeVlq(segment) {
  const fields = []
  let value = 0
  let shift = 0
  for (let i = 0; i < segment.length; i++) {
    const digit = VLQ_DIGITS.indexOf(segment[i])
    if (digit < 0) return fields
    value += (digit & 31) << shift
    if (digit & 32) {
      shift += 5
      continue
    }
    fields.push(value & 1 ? -(value >> 1) : value >> 1)
    value = 0
    shift = 0
  }
  return fields
}

// generated line (0 based) -> original line (0 based), or null where the
// generated line maps to nothing at all.
//
// Only the third field of each segment is wanted. The fields are deltas that
// carry on across lines, not within them, which is why the running total lives
// outside both loops: skipping the segments of a line would desynchronise every
// line after it.
function decodeLineMap(mappings) {
  const lines = []
  let sourceLine = 0
  String(mappings || '').split(';').forEach((group, generated) => {
    let first = null
    group.split(',').forEach((segment) => {
      if (!segment) return
      const fields = decodeVlq(segment)
      if (fields.length < 3) return
      sourceLine += fields[2]
      if (first === null) first = sourceLine
    })
    lines[generated] = first
  })
  return lines
}

// The emit names a map file that is never written anywhere, and the name is
// this file's throwaway model at that. Left in, the preview asks the page it was
// injected into for pane-7.js.map. It is on the last line, so removing it moves
// nothing above it.
const withoutMapComment = (js) => String(js).replace(/\n?\/\/# sourceMappingURL=[^\n]*\n?$/, '\n')

//---------------------------- compiling ------------------------------

// the last successful compile, and what it was made from
let compiled = { source: null, js: '', lineMap: null, fatal: false }
let compileSeq = 0

const compiledJs = () => compiled.js

// After a flavour switch, or a failure worth retrying: nothing cached applies.
const forgetCompiled = () => { compiled = { source: null, js: '', lineMap: null, fatal: false } }

// One diagnostic, as a line and a sentence. TypeScript nests the message when
// it has a chain of reasons; the outermost one is the useful sentence.
function describeDiagnostic(model, diagnostic) {
  let text = diagnostic.messageText
  while (text && typeof text !== 'string') text = text.messageText
  const at = model.getPositionAt(diagnostic.start || 0)
  return {
    line: at.lineNumber,
    column: at.column,
    message: String(text || 'Unknown error'),
    code: diagnostic.code,
  }
}

// Returns { js, fatal, errors, warnings }. A syntax error is fatal: there is
// nothing worth running, and running the last good output instead would show a
// preview of code that no longer exists. A type error is not - it is said out
// loud and the javascript still runs, the way it would through any build step
// that does not typecheck.
async function compileTypeScript(source) {
  const uri = monaco.Uri.parse('file:///quickcode/pane-' + (++compileSeq) + '.ts')
  const model = monaco.editor.createModel(source, 'typescript', uri)
  const key = uri.toString()
  try {
    const getWorker = await monaco.languages.typescript.getTypeScriptWorker()
    const client = await getWorker(uri)
    const [emit, syntactic, semantic] = await Promise.all([
      client.getEmitOutput(key),
      client.getSyntacticDiagnostics(key),
      client.getSemanticDiagnostics(key),
    ])
    const files = (emit && emit.outputFiles) || []
    const js = files.filter((f) => /\.js$/.test(f.name))[0]
    const map = files.filter((f) => /\.js\.map$/.test(f.name))[0]
    let mappings = ''
    try {
      mappings = map ? (JSON.parse(map.text).mappings || '') : ''
    } catch (err) {
      mappings = ''                 // no map, so no line numbers, so no guesses
    }
    const describe = (d) => describeDiagnostic(model, d)
    return {
      js: js ? withoutMapComment(js.text) : '',
      lineMap: decodeLineMap(mappings),
      fatal: syntactic.length > 0,
      errors: syntactic.map(describe),
      warnings: semantic.map(describe),
    }
  } finally {
    // the model exists only for the worker's benefit, and only until now
    model.dispose()
  }
}

// What the preview should run for the js pane. Plain javascript goes through
// untouched - that is the whole of the promise that existing projects are
// unaffected. Recompiling the same text twice is skipped, so typing in the html
// pane does not pay for the js pane over and over.
async function jsForPreview(source) {
  if (!usingTypeScript()) return source
  if (compiled.source === source) return compiled.fatal ? '' : compiled.js
  let result
  try {
    result = await compileTypeScript(source)
  } catch (err) {
    console.error('Could not compile the TypeScript', err)
    // Say so rather than running something stale, and do not cache it: the next
    // keystroke should try again.
    reportCompileProblems({ errors: [{ line: 1, column: 1, message: 'The TypeScript compiler could not be reached' }], warnings: [] })
    compiled = { source: null, js: '', lineMap: null, fatal: true }
    return ''
  }
  compiled = { source: source, js: result.js, lineMap: result.lineMap, fatal: result.fatal }
  publishCompiled(result.fatal ? '' : result.js)
  reportCompileProblems(result)
  return result.fatal ? '' : result.js
}

// The popped out preview has no monaco, so it cannot compile anything. The last
// good output is left where it can find it, beside the settings it already
// reads from there.
function publishCompiled(js) {
  if (!project) return
  try {
    localStorage.setItem(COMPILED_KEY, JSON.stringify({ id: project.id, js: js }))
  } catch (err) {
    // a full quota only means the popped out preview lags; the pane is fine
  }
}

// Turn a line in the generated javascript back into the line that was written.
// Blank and dropped lines map to nothing, so the nearest mapped line above is
// used; with no map at all there is nothing honest to say.
function tsSourceLine(generatedLine) {
  const map = compiled.lineMap
  if (!usingTypeScript() || !map || !map.length) return null
  for (let i = Math.min(generatedLine, map.length) - 1; i >= 0; i--) {
    if (typeof map[i] === 'number') return map[i] + 1
  }
  return null
}

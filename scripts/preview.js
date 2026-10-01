//=====================================================================
// The preview document.
//
// One builder for both previews - the pane beside the editor and the popped
// out tab - so what runs in one is exactly what runs in the other.
//
// Three rules hold this file together:
//
//   1. A literal closing script or style tag inside the user's code would end
//      the tag it is injected into and spill the rest into the markup, so it is
//      escaped on the way in. (This comment cannot spell those tags out either.)
//
//   2. Nothing injected above the user's own code may contain a newline. The
//      browser reports the line an error happened on relative to the whole
//      generated document, so every line added above their code moves the
//      number - and a line number that points at the wrong line is worse than
//      showing none at all. Everything that does have newlines (their css, their
//      js) is appended after their markup, and where each one starts is recorded
//      as the document is built.
//
//   3. Each script the user wrote names itself with a sourceURL comment. That
//      is what makes the reported filename say which pane an error came from;
//      it does not renumber the lines, which is what rule 2 is for.
//
//   4. The js pane runs as a module only when it actually imports something. A
//      module has its own scope and strict mode, so a top-level `var` stops
//      reaching `window` - which would quietly break a snippet whose markup
//      calls it from an onclick. Rules 2 and 3 both still hold inside a module:
//      the line number is still the document's, and the sourceURL still names
//      the pane. That was measured, not assumed.
//=====================================================================

// the line the next character will sit on
const lineOf = (text) => (text.match(/\n/g) || []).length + 1

const safeInline = (text) => text.replace(/<\/(script|style)/gi, '<\\/$1')

const escapeText = (text) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

// names the panes by the sourceURL the error reports
const SOURCE_MAIN = 'quickcode-html'
const SOURCE_JS = 'quickcode-js'

// An error from a script inside the user's own markup is not named by any
// sourceURL, and comes back as this instead.
const SOURCE_UNNAMED = 'about:srcdoc'

// One line, on purpose - see rule 2. Everything the preview sends home goes
// through here: console output, uncaught errors, and rejected promises.
const PREVIEW_PRELUDE = '<script>(function(){' +
  'var send=function(kind,args,line,file){try{parent.postMessage(' +
  '{__qc:true,kind:kind,args:args,line:line,file:file},"*")}catch(e){}};' +
  'var describe=function(v){if(typeof v==="string")return v;' +
  'try{var j=JSON.stringify(v);return j===undefined?String(v):j}catch(e){return String(v)}};' +
  '["log","warn","error","info","debug"].forEach(function(k){var orig=console[k];' +
  'console[k]=function(){var out=[];for(var i=0;i<arguments.length;i++){out.push(describe(arguments[i]))}' +
  'send(k,out);return orig.apply(console,arguments)}});' +
  'window.addEventListener("error",function(e){' +
  'send("error",[e.message],e.lineno,String(e.filename||""))});' +
  'window.addEventListener("unhandledrejection",function(e){' +
  'send("error",["Unhandled promise rejection: "+String(e.reason)])});' +
  '})();<\/script>'

const DOC_HEAD = '<!DOCTYPE html><html><head><meta charset="utf-8">'

// One line, like the prelude, and for the same reason: it sits above the user's
// code. It has to come before any module that resolves against it, so it goes
// in the head beside the prelude. safeInline because the names in it came from
// the user's own source.
const importMapTag = (texts) => {
  const map = importMapFor(texts)
  if (!map) return ''
  return '<script type="importmap">' + safeInline(JSON.stringify({ imports: map.imports })) + '<\/script>'
}

// See rule 4. Url imports need a module as much as bare ones do.
const scriptOpenFor = (text) => (hasImports(text) ? '<script type="module">\n' : '<script>\n')

// Build the document for a set of files, and say where each pane's own text
// begins in it: { html, sources: { <reported filename>: { pane, startLine } } }.
const buildPreviewDoc = (content, settings) => {
  const sources = {}
  const code = content.code || ''
  const css = content.css || ''
  const js = content.js || ''

  const styleTag = settings.css && css ? '<style>' + safeInline(css) + '</style>' : ''
  const scriptClose = '\n//# sourceURL=' + SOURCE_JS + '\n<\/script>'

  // in javascript mode the main pane is the whole payload
  if (settings.lang === 'javascript') {
    let doc = DOC_HEAD + PREVIEW_PRELUDE + importMapTag([code]) + '</head><body>' + scriptOpenFor(code)
    sources[SOURCE_JS] = { pane: 'main', startLine: lineOf(doc) }
    doc += safeInline(code) + scriptClose + '</body></html>'
    return { html: doc, sources: sources }
  }

  if (settings.lang === 'plaintext') {
    return {
      html: DOC_HEAD + PREVIEW_PRELUDE + '</head><body><pre style="margin: .5rem">' +
        escapeText(code) + '</pre></body></html>',
      sources: sources,
    }
  }

  // append the css and the js pane after the user's markup, then say where the
  // js started - so the html pane's numbering is untouched and the js pane's is
  // measured rather than guessed
  const appendExtras = (head, tail) => {
    let doc = head + styleTag
    if (settings.js && js) {
      doc += scriptOpenFor(js)
      sources[SOURCE_JS] = { pane: 'js', startLine: lineOf(doc) }
      doc += safeInline(js) + scriptClose
    }
    return doc + tail
  }

  // The map serves the html pane's own module scripts as well as the js pane's,
  // so both are read for it.
  const mapTag = importMapTag([code, settings.js ? js : ''])

  // A whole document from the editor keeps its own structure: it is injected
  // into rather than nested inside another one. The prelude goes first so it is
  // listening before anything the page does, and it is a single line so the
  // user's own line numbers still mean what they say.
  if (/<html[\s>]/i.test(code)) {
    const withPrelude = /<head[^>]*>/i.test(code)
      ? code.replace(/<head[^>]*>/i, (tag) => tag + PREVIEW_PRELUDE + mapTag)
      : PREVIEW_PRELUDE + mapTag + code
    sources[SOURCE_MAIN] = { pane: 'main', startLine: 1 }
    sources[SOURCE_UNNAMED] = { pane: 'main', startLine: 1 }

    const at = withPrelude.search(/<\/body>/i)
    return {
      html: at > -1
        ? appendExtras(withPrelude.slice(0, at), withPrelude.slice(at))
        : appendExtras(withPrelude, ''),
      sources: sources,
    }
  }

  const head = DOC_HEAD + PREVIEW_PRELUDE + mapTag + '</head><body>'
  sources[SOURCE_MAIN] = { pane: 'main', startLine: lineOf(head) }
  sources[SOURCE_UNNAMED] = { pane: 'main', startLine: lineOf(head) }
  // the html pane is markup, and goes in as it was written. Escaping its script
  // tags the way the css and js panes are escaped would stop any script in it
  // from ever closing, and everything after it would be swallowed.
  return {
    html: appendExtras(head + code, '</body></html>'),
    sources: sources,
  }
}

// Turn what the browser reported into a line in the editor the user is looking
// at. Returns null when nothing can be said honestly about it.
const previewLocation = (sources, file, line) => {
  if (!line) return null
  const source = sources[file] || (file ? null : sources[SOURCE_UNNAMED])
  if (!source) return null
  const editorLine = line - source.startLine + 1
  if (editorLine < 1) return null
  return { pane: source.pane, line: editorLine }
}

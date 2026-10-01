//=====================================================================
// Bare import specifiers.
//
// A browser cannot make sense of `import confetti from "canvas-confetti"`.
// There is no bundler and no node_modules, so the name resolves to nothing. An
// import map in the preview document is what gives it a meaning, and the map is
// built by reading the code rather than being kept by hand.
//
// This is NOT a module resolver and does not pretend to be one. It recognises
// the shapes a snippet actually writes. Two things it gets deliberately right,
// because both would otherwise change how a snippet runs:
//
//   - The word "import" inside a string or a comment is not an import. Finding
//     one there would flip the snippet into module mode, which has its own
//     scope and strict mode, and break code that worked.
//   - Anything that is already an address - a url, an absolute or relative path
//     - is left alone. Only bare names need a map.
//=====================================================================

const CDN = 'https://esm.sh/'

// A url, an absolute path, or a relative one: already resolvable, so not ours.
const isAddressSpecifier = (spec) => /^(?:[a-z][a-z0-9+.\-]*:|\/|\.\.?\/)/i.test(spec)

// After these, a slash starts a regular expression. After an identifier, a
// closing bracket or a number, the same slash is division. Getting this wrong
// only matters because a pattern like /['"]/ would otherwise read as the start
// of a string and swallow the code after it.
const REGEX_AFTER_WORD = /^(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/
const DIVISION_AFTER = /[A-Za-z0-9_$)\]]/

// Every string literal becomes a numbered hole and every comment a space, so
// the patterns below cannot match inside either. The holes keep the contents,
// because one of those strings is the specifier being looked for.
const blankOut = (text) => {
  const strings = []
  let out = ''
  let i = 0
  let lastChar = ''
  let lastWord = ''
  const n = text.length

  while (i < n) {
    const c = text[i]

    if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++
      i += 2
      out += ' '
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const opened = i
      i++
      while (i < n && text[i] !== c) {
        if (text[i] === '\\') i++
        i++
      }
      i++
      strings.push(text.slice(opened + 1, Math.max(opened + 1, i - 1)))
      out += '\u0000' + (strings.length - 1) + '\u0000'
      lastChar = ')'            // a string is a value: a slash after it divides
      lastWord = ''
      continue
    }
    if (c === '/' && (lastChar === '' || REGEX_AFTER_WORD.test(lastWord) || !DIVISION_AFTER.test(lastChar))) {
      i++
      while (i < n && text[i] !== '/' && text[i] !== '\n') {
        if (text[i] === '\\') i++
        i++
      }
      i++
      out += ' '
      lastChar = ')'
      lastWord = ''
      continue
    }

    if (/[A-Za-z0-9_$]/.test(c)) {
      lastWord += c
    } else if (!/\s/.test(c)) {
      lastWord = ''
    }
    if (!/\s/.test(c)) lastChar = c
    out += c
    i++
  }
  return { clean: out, strings: strings }
}

// The forms a snippet writes. Each captures the number of the hole holding the
// specifier. Holes are excluded from the gaps so a pattern cannot reach across
// one string to find another.
const importPatterns = () => [
  /\bimport\s*\(\s*\u0000(\d+)\u0000/g,                                  // import('pkg')
  /\bimport\s+\u0000(\d+)\u0000/g,                                       // import 'pkg'
  /\b(?:import|export)\b[^;\u0000]*?\bfrom\s*\u0000(\d+)\u0000/g,        // … from 'pkg'
]

// The bare names this code imports, in the order they appear, each once.
const findSpecifiers = (source) => {
  const scanned = blankOut(String(source || ''))
  const found = []
  importPatterns().forEach((pattern) => {
    let match
    while ((match = pattern.exec(scanned.clean))) {
      const spec = scanned.strings[Number(match[1])]
      if (spec && !isAddressSpecifier(spec) && found.indexOf(spec) < 0) found.push(spec)
    }
  })
  return found
}

// Does this code import at all? Url imports count: they need a module too, even
// though they need no map. This is the gate on the module switch, so it answers
// about the code as written and nothing else.
const hasImports = (source) => {
  const scanned = blankOut(String(source || ''))
  return importPatterns().some((pattern) => pattern.test(scanned.clean))
}

// 'lodash-es/debounce' -> 'lodash-es', '@scope/pkg/deep' -> '@scope/pkg'
const packageRoot = (spec) => {
  const parts = spec.split('/')
  return spec.charAt(0) === '@' ? parts.slice(0, 2).join('/') : parts[0]
}

// { specs, imports } for everything these texts import, or null for none. The
// trailing-slash entry covers a deep path reached later by a dynamic import,
// which no amount of reading the code up front can predict.
const importMapFor = (texts) => {
  const specs = []
  ;(texts || []).forEach((text) => {
    findSpecifiers(text).forEach((spec) => {
      if (specs.indexOf(spec) < 0) specs.push(spec)
    })
  })
  if (!specs.length) return null

  const imports = {}
  specs.forEach((spec) => {
    imports[spec] = CDN + spec
    const root = packageRoot(spec)
    if (root) imports[root + '/'] = CDN + root + '/'
  })
  return { specs: specs, imports: imports }
}

//------------------------- is it actually there -----------------------
// A module whose import cannot be fetched fails in complete silence: no error
// event, no rejected promise, nothing. The browser will not tell the page and
// the page cannot tell us, so the only way to say anything useful is to ask
// first, from here, where a failure is visible.

// Only successes are remembered. A failure must not be cached, or coming back
// online would keep reporting a problem that has gone away.
const reachableImports = {}

const importProblem = async (spec) => {
  const url = CDN + spec
  if (reachableImports[url]) return null
  let response
  try {
    response = await fetch(url)
  } catch (err) {
    return navigator.onLine
      ? 'Cannot import "' + spec + '" - esm.sh could not be reached.'
      : 'Cannot import "' + spec + '" - you appear to be offline. Imports are ' +
        'fetched from esm.sh, which needs a network; the rest of QuickCode does not.'
  }
  if (!response.ok) {
    return 'Cannot import "' + spec + '" - esm.sh has no such package (HTTP ' +
      response.status + '). Check the spelling, or pin a version that exists.'
  }
  reachableImports[url] = true
  return null
}

// Every specifier these texts import, checked at once. Returns the problems, in
// specifier order, and an empty list when there is nothing to say.
const importProblems = async (texts) => {
  const map = importMapFor(texts)
  if (!map) return []
  const answers = await Promise.all(map.specs.map(importProblem))
  return answers.filter(Boolean)
}

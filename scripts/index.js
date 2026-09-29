//=====================================================================
// QuickCode core: settings, storage, the editor table, toolbar wiring.
// Nothing here runs on load; bootQuickCode() in eventListener.js starts it
// once monaco has finished loading.
//=====================================================================

const gets = (selector) => document.querySelector(selector)
const getsAll = (selector) => document.querySelectorAll(selector)

//----------------------------- settings ------------------------------

const defaultSettings = { theme: 'vs-dark', lang: 'html', tab: 'main', js: false, css: false, vnav: false, split: false, splitLang: 'html' }

// themes stored before the dropdown values were corrected to match the file
// names on disk, which 404 on a case sensitive host
const themeAliases = { ayudark: 'AyuDark', dracula: 'Dracula' }

// merged over the defaults so a missing, partial or corrupt object still has every key
const readSettings = () => {
  let saved
  try {
    saved = JSON.parse(localStorage.getItem('quickEdit'))
  } catch (err) {
    saved = null
  }
  return Object.assign({}, defaultSettings, saved)
}

// The single in-memory copy of the settings. Everything reads this and every
// write goes through saveSettings, so the two can never drift apart.
let quickEdit = readSettings()

//-------------------------- batched storage --------------------------
// localStorage.setItem is synchronous and hits the disk, so writing on every
// keystroke made typing stutter in a large file. Queue writes and flush at
// most every 300ms, plus whenever the text is about to be read back or the
// page may go away.

const STORAGE_FLUSH_MS = 300
const pendingWrites = new Map()
let writeTimer = null

const flushStorage = () => {
  if (writeTimer !== null) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  pendingWrites.forEach((value, key) => localStorage.setItem(key, value))
  pendingWrites.clear()
}

const writeSoon = (key, value) => {
  pendingWrites.set(key, value)
  if (writeTimer === null) {
    writeTimer = setTimeout(flushStorage, STORAGE_FLUSH_MS)
  }
}

// a queued write has not reached localStorage yet, so reads come through here
const readStored = (key) => {
  if (pendingWrites.has(key)) {
    return pendingWrites.get(key)
  }
  return localStorage.getItem(key) || ''
}

// Settings are written straight through rather than queued: they only change
// on a click, they are tiny, and the preview window reads them back on the
// storage event, so a delayed write would show it stale settings.
const saveSettings = (patch) => {
  Object.assign(quickEdit, patch)
  localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
  return quickEdit
}

//--------------------------- editor table ----------------------------
// One description of the three editors. Everywhere that used to branch on
// main/css/js and re-derive the storage key, the monaco language and the DOM
// ids now reads them from here.

const TABS = {
  main: { key: 'code', lang: 'html', tabSel: '#main', paneSel: '#CodeBlock', get: () => editor, ensure: () => ensureMainEditor() },
  css: { key: 'css', lang: 'css', tabSel: '#css', paneSel: '#cssEditor', get: () => cssEditor, ensure: () => ensureCssEditor() },
  js: { key: 'js', lang: 'javascript', tabSel: '#js', paneSel: '#jsEditor', get: () => jsEditor, ensure: () => ensureJsEditor() },
}
const TAB_IDS = ['main', 'css', 'js']

// the split pane is addressed by monaco language name
const SPLIT_TABS = { html: 'main', css: 'css', javascript: 'js' }

// Shared monaco setup. The option names matter: lineNumber, glyphmargin and
// scrollBeyoundLastLine were misspelled and silently ignored.
const editorOptions = (value, language) => ({
  value: value,
  language: language,
  lineNumbers: 'on',
  glyphMargin: false,
  scrollBeyondLastLine: false,
  readOnly: false,
  automaticLayout: true,
  minimap: {
    enabled: true,
  },
  lineHeight: 30,
  scrollbar: {
    verticalScrollbarSize: 20,
    horizontalScrollbarSize: 17,
  },
})

// setValue() throws away the undo stack, so only write when the text differs
const syncValue = (target, text) => {
  if (target && target.getValue() !== text) {
    target.getModel().setValue(text)
  }
}

// The main editor is the only one built up front; the css, js and split panes
// are created the first time they are actually shown.
let editor = null

const ensureMainEditor = () => {
  if (!editor) {
    gets('#CodeBlock').innerHTML = ''
    editor = monaco.editor.create(gets('#CodeBlock'), editorOptions(readStored('code'), quickEdit.lang))
    editor.getModel().onDidChangeContent(() => saveEditor('main'))
    editor.onDidBlurEditorWidget(() => onEditorBlur('main'))
    editor.onDidFocusEditorWidget(() => onEditorFocus('main'))
    addAction(editor)
  }
  return editor
}

const saveEditor = (id) => {
  const spec = TABS[id]
  const ed = spec && spec.get()
  if (ed) {
    writeSoon(spec.key, ed.getValue())
  }
}

// the text of a pane, whether or not its editor has been created yet
const contentOf = (id) => {
  const spec = TABS[id]
  if (!spec) return ''
  const ed = spec.get()
  return ed ? ed.getValue() : readStored(spec.key)
}

//--------------------------- save as file ----------------------------

const fileExt = {
  js: 'javascript',
  txt: 'plaintext',
  json: 'json',
  html: 'html',
  css: 'css',
  zip: 'zip',
}

let fileName = false
let ext = 'html'

const extFor = (language) => Object.keys(fileExt).find((key) => fileExt[key] === language) || 'txt'

const suggestedFileName = () => {
  if (quickEdit.tab === 'main') {
    // keep the name of a file that was opened rather than overwriting it
    return fileName || 'file.' + ext
  }
  return 'file.' + TABS[quickEdit.tab].key
}

const showOverlay = () => {
  gets('#overlay').style.display = 'block'
  const input = gets('#filename')
  input.value = suggestedFileName()
  input.focus()
  input.select()
}

const hideOverlay = () => {
  gets('#overlay').style.display = 'none'
}

function saveFile() {
  const spec = TABS[quickEdit.tab]
  if (!spec) return
  flushStorage()
  const fname = gets('#filename').value.trim() || suggestedFileName()
  const blob = new Blob([contentOf(quickEdit.tab)], { type: 'text/plain;charset=utf-8' })
  saveAs(blob, fname)
  hideOverlay()
}

//------------------------ open file & project ------------------------

function getExtension(filename) {
  const found = filename.split('.').pop()
  return fileExt[found] ? found : 'txt'
}

function openProject(zipFile) {
  const filename = zipFile.name
  const reader = new FileReader()

  reader.onload = (ev) => {
    JSZip.loadAsync(ev.target.result).then((zip) => {
      // read whichever of the three a QuickCode export normally holds, so a
      // zip missing one still imports instead of failing outright
      const pick = (name) => {
        const entry = zip.file(name)
        return entry ? entry.async('string') : Promise.resolve(null)
      }
      return Promise.all([
        pick('QuickCode/index.html'),
        pick('QuickCode/style.css'),
        pick('QuickCode/index.js'),
      ])
    }).then((parts) => {
      let [newHtml, newCss, newJs] = parts
      if (newHtml === null && newCss === null && newJs === null) {
        throw new Error('it contains no QuickCode/index.html, style.css or index.js')
      }
      if (newHtml !== null) {
        newHtml = newHtml.replace('<link rel="stylesheet" href="style.css">', '')
        newHtml = newHtml.replace('<script src="index.js"></script>', '')
        setPaneText('main', newHtml)
      }
      if (newCss !== null) setPaneText('css', newCss)
      if (newJs !== null) setPaneText('js', newJs)
    }).catch((err) => {
      // this used to fail with nothing but a console message
      console.error('Failed to open', filename, 'as a QuickCode project:', err)
      alert('Could not open "' + filename + '" as a QuickCode project: ' + err.message)
    })
  }

  reader.onerror = (err) => {
    console.error('Failed to read file', err)
    alert('Could not read "' + filename + '".')
  }

  reader.readAsArrayBuffer(zipFile)
}

// write into a pane whether or not its editor exists yet
const setPaneText = (id, text) => {
  const spec = TABS[id]
  if (!spec) return
  const ed = spec.get()
  if (ed) {
    syncValue(ed, text)
  } else {
    writeSoon(spec.key, text)
  }
}

function openFile(file) {
  const reader = new FileReader()
  reader.onload = () => {
    setPaneText(quickEdit.tab, String(reader.result))
  }
  fileName = file.name
  gets('#filename').value = fileName
  if (quickEdit.tab === 'main') {
    setLang(fileExt[getExtension(fileName)])
  }
  reader.readAsText(file)
}

//------------------------- language & theme --------------------------

function displayRun() {
  const runnable = quickEdit.lang === 'html' || quickEdit.lang === 'javascript' || quickEdit.lang === 'plaintext'
  gets('#openwin').style.visibility = runnable ? 'visible' : 'hidden'
}

const setLang = (ln) => {
  saveSettings({ lang: ln })
  monaco.editor.setModelLanguage(ensureMainEditor().getModel(), ln)
  ext = extFor(ln)
  if (fileName) {
    // keep the opened file's base name, just follow the new language
    gets('#filename').value = fileName.replace(/\.[^.]*$/, '') + '.' + ext
  } else {
    gets('#filename').value = 'file.' + ext
  }
  const isHtml = ln === 'html'
  gets('.tabs').style.display = isHtml ? 'flex' : 'none'
  // export only makes sense for a html project, and this has to follow the
  // language for the whole session, not just on the initial load
  gets('#export').style.display = isHtml ? 'block' : 'none'
  displayRun()
}

function settheme(themeName) {
  themeName = themeAliases[themeName] || themeName
  saveSettings({ theme: themeName })

  if (themeName === 'vs' || themeName === 'vs-dark') {
    monaco.editor.setTheme(themeName)
    return
  }

  fetch('./themes/' + themeName + '.json')
    .then((response) => {
      if (!response.ok) {
        throw new Error('HTTP ' + response.status)
      }
      return response.json()
    })
    .then((data) => {
      monaco.editor.defineTheme(themeName, data)
      monaco.editor.setTheme(themeName)
    })
    .catch((err) => {
      // without this the theme silently stayed on the previous one
      console.error('Failed to load theme', themeName, err)
      monaco.editor.setTheme('vs-dark')
      gets('#theme').innerText = 'vs-dark'
      saveSettings({ theme: 'vs-dark' })
    })
}

//---------------------------- preview tab ----------------------------

function openWin() {
  flushStorage()
  if (quickEdit.lang === 'html') {
    window.open('./app.html', '_blank')
    return
  }
  let code = readStored('code')
  const win = window.open()
  const doc = win.document
  doc.open()
  if (quickEdit.lang === 'javascript') {
    code = `<script>${code}</script>`
  } else if (quickEdit.lang === 'plaintext') {
    const escaped = code.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    code = `<pre style="margin: .5rem">${escaped}</pre>`
  }
  doc.write(code)
  doc.close()
}

//------------------------------- navbar ------------------------------

const NARROW_WIDTH = 670

// Below the breakpoint the vertical nav is forced; above it the stored
// preference wins. Resizing used to overwrite that preference, so choosing
// the vertical nav on a wide screen was undone by the very next resize.
let prefersVerticalNav = false

const applyNavLayout = () => {
  const vertical = prefersVerticalNav || window.innerWidth <= NARROW_WIDTH
  gets('#vnav').disabled = !vertical
  if (!vertical && quickEdit.lang === 'html') {
    gets('.tabs').style.display = 'flex'
  }
}

const setVerticalNav = (vertical) => {
  prefersVerticalNav = vertical
  saveSettings({ vnav: vertical })
  applyNavLayout()
}

function restoreNavbar() {
  gets('nav').style.display = 'flex'
  gets('#shownav').style.display = 'block'
  gets('#hidenav').style.display = 'none'
}

function collapseNavbar() {
  gets('nav').style.display = 'none'
  gets('#shownav').style.display = 'none'
  gets('#hidenav').style.display = 'block'
}

//-------------------------------- tabs -------------------------------

function makeActive(id) {
  if (!TABS[id]) return
  TABS[id].ensure()
  TAB_IDS.forEach((other) => {
    const active = other === id
    gets(TABS[other].tabSel).classList.toggle('active-tab', active)
    gets(TABS[other].paneSel).style.display = active ? 'block' : 'none'
  })
  // the language dropdown only applies to the main editor
  gets('.selectA').style.visibility = id === 'main' ? 'visible' : 'hidden'
  // css on its own cannot be previewed
  gets('#openwin').style.visibility = id === 'css' ? 'hidden' : 'visible'
  saveSettings({ tab: id })
}

function updateEditor(id) {
  const spec = TABS[id]
  if (!spec) return
  const target = spec.get()
  // an editor that does not exist yet reads storage when it is created
  if (target) {
    syncValue(target, readStored(spec.key))
  }
}

function updateSplit(lang) {
  if (!quickEdit.split || !splitEditor) return
  const id = SPLIT_TABS[lang]
  if (!id) return
  syncValue(splitEditor, contentOf(id))
}

//---------------------------- click wiring ---------------------------

const onClick = (el, fn) => {
  if (el) el.addEventListener('click', fn)
}

//---------------------------- core startup ---------------------------

function initCore() {
  emmetMonaco.emmetHTML(monaco)

  // seed the content keys so app.html and the line counters never see null
  TAB_IDS.forEach((id) => {
    if (localStorage.getItem(TABS[id].key) === null) {
      localStorage.setItem(TABS[id].key, '')
    }
  })
  localStorage.setItem('quickEdit', JSON.stringify(quickEdit))

  // never lose queued text
  window.addEventListener('pagehide', flushStorage)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushStorage()
  })

  ext = extFor(quickEdit.lang)
  gets('#lang').innerText = quickEdit.lang
  gets('#theme').innerText = quickEdit.theme
  gets('#filename').value = 'file.' + ext

  settheme(quickEdit.theme)
  ensureMainEditor()

  if (quickEdit.lang === 'html') {
    gets('.tabs').style.display = 'flex'
    gets('#export').style.display = 'block'
    makeActive(quickEdit.tab)
  }
  displayRun()

  prefersVerticalNav = quickEdit.vnav
  applyNavLayout()
  window.addEventListener('resize', applyNavLayout)

  wireToolbar()
  wireDropdowns()
}

function wireToolbar() {
  // save dialog
  onClick(gets('#save'), showOverlay)
  onClick(gets('#savefile'), saveFile)
  gets('#overlay').addEventListener('click', hideOverlay)
  gets('.box').addEventListener('click', (e) => e.stopPropagation())
  gets('#filename').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveFile()
  })
  document.addEventListener('keydown', (e) => {
    // e.which is deprecated, and without preventDefault the browser's own
    // save dialog can open on top of ours
    if ((e.key === 's' || e.key === 'S') && e.ctrlKey && e.shiftKey) {
      e.preventDefault()
      showOverlay()
    }
  })

  // open a file or a project zip
  gets('#file').addEventListener('change', function () {
    const picked = this.files[0]
    if (picked) {
      if (getExtension(picked.name) === 'zip') {
        openProject(picked)
      } else {
        openFile(picked)
      }
    }
    // clearing the input is what lets the same file be picked again: without
    // it the value is unchanged and no change event fires
    this.value = ''
  })

  onClick(gets('#openwin'), openWin)
  onClick(gets('#export'), exportProject)
  onClick(gets('#top'), moveTop)

  // navbar
  onClick(gets('#alignbtn'), () => setVerticalNav(!prefersVerticalNav))
  onClick(gets('#hidenav'), restoreNavbar)
  onClick(gets('#shownav'), collapseNavbar)

  // tab strip
  TAB_IDS.forEach((id) => {
    onClick(gets(TABS[id].tabSel), () => {
      makeActive(id)
      updateEditor(id)
    })
  })

  // the enable-in-preview checkboxes must not also switch tabs
  getsAll('.tab>input').forEach((box) => {
    box.addEventListener('click', (e) => e.stopPropagation())
  })
  const cssCheck = gets('#cssCheck')
  const jsCheck = gets('#jsCheck')
  cssCheck.checked = Boolean(quickEdit.css)
  jsCheck.checked = Boolean(quickEdit.js)
  cssCheck.addEventListener('change', () => saveSettings({ css: cssCheck.checked }))
  jsCheck.addEventListener('change', () => saveSettings({ js: jsCheck.checked }))
}

//-------------------------- select dropdowns -------------------------

function wireDropdowns() {
  let dropdownZ = 1

  getsAll('.selectBtn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const list = btn.nextElementSibling
      list.classList.toggle('toggle')
      list.style.zIndex = dropdownZ++
    })
  })

  // Apply the choice straight from the option that was clicked. This used to
  // count clicks on the whole .select container and act only on even ones, so
  // a stray click inside it swallowed the next selection.
  const apply = { selectA: setLang, selectB: settheme }
  getsAll('.option').forEach((opt) => {
    opt.addEventListener('click', () => {
      const select = opt.closest('.select')
      const btn = select.children[0]
      opt.parentElement.classList.remove('toggle')
      btn.setAttribute('data-type', opt.getAttribute('data-type'))
      btn.innerText = opt.innerText
      const which = select.classList.contains('selectA') ? 'selectA' : 'selectB'
      apply[which](opt.getAttribute('data-type'))
    })
  })

  // close any open dropdown when clicking away from it
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.select')) {
      getsAll('.selectDropdown').forEach((d) => d.classList.remove('toggle'))
    }
  })
}

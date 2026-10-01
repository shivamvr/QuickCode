//=====================================================================
// QuickCode core: settings, storage, the editor table, toolbar wiring.
// Nothing here runs on load; bootQuickCode() in eventListener.js starts it
// once monaco has finished loading.
//=====================================================================

const gets = (selector) => document.querySelector(selector)
const getsAll = (selector) => document.querySelectorAll(selector)

//----------------------------- settings ------------------------------
// Settings come in two halves. The app's own - the theme and the toolbar
// layout - are global. The rest belong to the project: carrying them across
// would drop you into someone else's tab, language and split after a switch.
// quickEdit is the flat merged view that everything reads.

const defaultSettings = { theme: 'vs-dark', vnav: false, lang: 'html', tab: 'main', js: false, css: false, split: false, splitLang: 'html', splitRatio: 0.5, jsLang: 'javascript' }

// the per-project half, defined next to the record in store.js
const PROJECT_SETTING_KEYS = Object.keys(PROJECT_SETTINGS)

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

//--------------------------- the open project ------------------------
// The record itself is the live copy: a keystroke lands on it immediately, so
// every existing reader stays synchronous, and only the write out to IndexedDB
// is batched. That is the same shape the old localStorage batching had.

let project = null
let storeAvailable = true

const STORAGE_FLUSH_MS = 300
let writeTimer = null

const scheduleFlush = () => {
  if (writeTimer === null) {
    writeTimer = setTimeout(flushStorage, STORAGE_FLUSH_MS)
  }
}

const cancelFlush = () => {
  if (writeTimer !== null) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
}

const readStored = (key) => (project && project[key]) || ''

const writeSoon = (key, value) => {
  if (!project) return
  project[key] = value
  scheduleFlush()
  schedulePreview()
  scheduleSnapshot()
}

// app.html rebuilds the preview whenever localStorage changes. Content does not
// go through localStorage any more, so it needs a nudge of its own; it arrives
// after the write lands, so the preview never shows something that was not
// saved.
const pingPreview = () => {
  // app.html has no monaco and cannot compile TypeScript, so the output it
  // needs is produced here and left where it can find it. Same text twice
  // compiles once, so this costs nothing while the html pane is being edited.
  if (usingTypeScript()) {
    jsForPreview(readStored('js')).catch((err) => console.error('Could not compile', err))
  }
  try {
    localStorage.setItem('quickcodeRev', String(Date.now()))
  } catch (err) {
    // the preview simply refreshes a little later, on the next settings write
  }
}

const flushStorage = () => {
  if (writeTimer !== null) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  if (!project || !storeAvailable) return Promise.resolve()
  return saveProject(project).then(() => {
    // the crash net is only needed while something may be unwritten
    localStorage.removeItem(SNAPSHOT_KEY)
    pingPreview()
  }, (err) => {
    console.error('Could not save the project', err)
  })
}

// Settings are written to localStorage straight through rather than queued:
// they only change on a click, they are tiny, and the preview window reads them
// back on the storage event, so a delayed write would show it stale settings.
const saveSettings = (patch) => {
  Object.assign(quickEdit, patch)
  localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
  if (project && Object.keys(patch).some((key) => PROJECT_SETTING_KEYS.indexOf(key) > -1)) {
    PROJECT_SETTING_KEYS.forEach((key) => { project.settings[key] = quickEdit[key] })
    scheduleFlush()
  }
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

// The split pane is addressed by monaco language name, and the js pane answers
// to both of its flavours.
const SPLIT_TABS = { html: 'main', css: 'css', javascript: 'js', typescript: 'js' }

// What monaco should highlight a pane as. The js pane follows the project's
// flavour; the other two are what the table says. The plan for item 10 called
// this out: one fixed language per pane was baked into TABS, and TypeScript
// needed "what it is highlighted as" separated from the table's fixed answer.
const langOf = (id) => (id === 'js' ? quickEdit.jsLang : (TABS[id] && TABS[id].lang))

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
  // Both of these arrived turned on by default in the 0.52 upgrade, and both
  // change how the editor looks: coloured brackets, and a pinned header showing
  // the enclosing scope. Off keeps the editor looking exactly as it did. Either
  // is one word to turn on, and worth trying.
  bracketPairColorization: { enabled: false },
  stickyScroll: { enabled: false },
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
    markUnsaved(id)
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

//------------------------- files on disk -----------------------------
// The File System Access API lets a pane be backed by a real file: opened
// through a picker and written back in place, instead of downloading a copy
// into Downloads and moving it over the original by hand.
//
// It is Chromium only, so the hidden <input type="file"> and the fileSaver
// download remain the other branch. Both paths have to keep working.

// null until the pane is backed by a real file. Per project, and remembered
// across reloads in the handles store.
const fileHandles = { main: null, css: null, js: null }

// whether the buffer has moved on from that file. Only meaningful where a
// handle exists: without one there is nothing on disk to be out of date.
const unsaved = { main: false, css: false, js: false }

const hasFilePicker = () => typeof window.showOpenFilePicker === 'function'
const hasSavePicker = () => typeof window.showSaveFilePicker === 'function'

// mime -> extensions, the shape showOpenFilePicker wants; mirrors the accept
// list on the hidden input
const OPEN_TYPES = [{
  description: 'Code',
  accept: {
    'text/html': ['.html'],
    'text/css': ['.css'],
    'text/javascript': ['.js'],
    'application/json': ['.json'],
    'text/plain': ['.txt'],
    'application/zip': ['.zip'],
  },
}]

// Cancelling any picker rejects with AbortError. That is a no-op rather than a
// failure, and has to leave the editor exactly as it was.
const cancelled = (err) => Boolean(err) && err.name === 'AbortError'

const extFor = (language) => Object.keys(fileExt).find((key) => fileExt[key] === language) || 'txt'

const suggestedFileName = () => {
  const handle = fileHandles[quickEdit.tab]
  if (handle) return handle.name
  if (quickEdit.tab === 'main') {
    // keep the name of a file that was opened rather than overwriting it
    return fileName || 'file.' + ext
  }
  return 'file.' + TABS[quickEdit.tab].key
}

// The tab title is the one place with room for the file name and an unsaved
// marker, so it can say which file Ctrl+S writes to with no new markup.
const updateTitle = () => {
  const handle = fileHandles[quickEdit.tab]
  document.title = handle
    ? (unsaved[quickEdit.tab] ? '\u25cf ' : '') + handle.name + ' - QuickCode'
    : 'QuickCode'
}

const markUnsaved = (id) => {
  if (!fileHandles[id] || unsaved[id]) return
  unsaved[id] = true
  updateTitle()
}

const markSaved = (id) => {
  unsaved[id] = false
  updateTitle()
}

// A handle is worth keeping: reopening the project should still know which file
// each pane came from. Permission to write is not restored with it - that has
// to be asked for inside a user gesture, which the next Ctrl+S provides.
const attachHandle = (id, handle) => {
  fileHandles[id] = handle
  markSaved(id)
  if (!storeAvailable || !project) return Promise.resolve()
  return saveHandle(project.id, id, handle)
    .catch((err) => console.error('Could not remember the file', err))
}

// A handle carries read permission from the moment it is picked; writing needs
// its own grant. requestPermission only works inside a user gesture, which is
// why this is awaited on the way to the first write and never at startup.
const ensureWritable = async (handle) => {
  if (typeof handle.queryPermission !== 'function') return true
  const opts = { mode: 'readwrite' }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  return (await handle.requestPermission(opts)) === 'granted'
}

// createWritable() truncates the file straight away, so a crash mid-write can
// leave it empty. Acceptable for an editor buffer; not for a project store.
const writeToDisk = async (handle, text) => {
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
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

// Ctrl+S, and the save dialog while its name is left unchanged. Writes straight
// back when the pane has a file, which is the whole point of keeping the handle;
// with no handle it falls through to Save as, so a browser without the API
// behaves exactly as it always did.
async function quickSave() {
  const id = quickEdit.tab
  const handle = fileHandles[id]
  if (!handle) {
    showOverlay()
    return
  }
  flushStorage()
  try {
    if (!(await ensureWritable(handle))) return
    await writeToDisk(handle, contentOf(id))
    markSaved(id)
  } catch (err) {
    if (cancelled(err)) return
    console.error('Failed to save', handle.name, err)
    alert('Could not save "' + handle.name + '": ' + err.message)
  }
}

// The overlay's save button. Writes back to the open file while the name is
// unchanged and does a Save as once it is edited, which keeps one-click saving
// on the mouse path: the overlay is also where 'export project' lives, so the
// toolbar icon has to go on opening it rather than saving silently.
function saveFromOverlay() {
  const handle = fileHandles[quickEdit.tab]
  const typed = gets('#filename').value.trim()
  if (handle && (typed === '' || typed === handle.name)) {
    hideOverlay()
    return quickSave()
  }
  return saveFile()
}

// Save as: the name from the overlay, then a real location where the browser
// can offer one and a download where it cannot.
async function saveFile() {
  const id = quickEdit.tab
  if (!TABS[id]) return
  flushStorage()
  const fname = gets('#filename').value.trim() || suggestedFileName()
  const text = contentOf(id)
  hideOverlay()

  if (!hasSavePicker()) {
    saveAs(new Blob([text], { type: 'text/plain;charset=utf-8' }), fname)
    return
  }

  let handle
  try {
    handle = await window.showSaveFilePicker({ suggestedName: fname })
    await writeToDisk(handle, text)
  } catch (err) {
    if (cancelled(err)) return
    console.error('Failed to save', fname, err)
    alert('Could not save "' + fname + '": ' + err.message)
    return
  }
  // from here on Ctrl+S goes to this file
  if (id === 'main') fileName = handle.name
  attachHandle(id, handle)
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
      // a zip replaces all three panes at once, which is the most destructive
      // thing the app can do to a project
      return snapshotBefore('zip import').then(() => parts)
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

// the shared tail of both open paths
const openText = (id, name, text) => {
  setPaneText(id, text)
  fileName = name
  gets('#filename').value = name
  if (id === 'main') {
    setLang(fileExt[getExtension(name)])
  }
}

// The fallback path, for browsers with no picker. The pane is captured up front
// because the read is asynchronous and the tab can change while it runs.
function openFile(file) {
  const id = quickEdit.tab
  const reader = new FileReader()
  reader.onload = () => {
    // the pane is about to be replaced wholesale
    snapshotBefore('file opened').then(() => openText(id, file.name, String(reader.result)))
  }
  reader.onerror = () => {
    // the name and language used to be applied before the read, so a failed
    // read left the editor claiming to hold a file it never received
    console.error('Failed to read file', reader.error)
    alert('Could not read "' + file.name + '".')
  }
  reader.readAsText(file)
}

// read a handle into a pane and leave the pane owning it. Shared by the file
// picker and by a file the operating system handed us.
const openHandle = async (handle, id) => {
  const file = await handle.getFile()
  await snapshotBefore('file opened')
  // the text lands first: writing it marks the pane unsaved, so the handle has
  // to be attached before markSaved settles it
  openText(id, file.name, await file.text())
  attachHandle(id, handle)
}

// The picker path. A zip is still a project import, which has no single file to
// write back to, so it deliberately leaves the pane without a handle.
async function openWithPicker() {
  const id = quickEdit.tab
  try {
    const picked = await window.showOpenFilePicker({ types: OPEN_TYPES })
    const handle = picked[0]
    if (getExtension(handle.name) === 'zip') {
      openProject(await handle.getFile())
      return
    }
    await openHandle(handle, id)
  } catch (err) {
    if (cancelled(err)) return
    console.error('Failed to open a file', err)
    alert('Could not open that file: ' + err.message)
  }
}

//------------------------- opened from the desktop -------------------
// An installed QuickCode registers as a handler for .html, .css and .js
// (manifest.webmanifest), so double-clicking one of those launches it with a
// real file handle - and Ctrl+S then writes back to the file that was
// double-clicked. That is what makes the file handles of item 02 feel finished.

// Which pane a file belongs in, by its language. A stylesheet opened from the
// desktop belongs in the css pane, not over the top of the html.
const paneFor = (name) => SPLIT_TABS[fileExt[getExtension(name)]] || 'main'

// The user did not choose the destination here, QuickCode did, so replacing
// unsaved work that is in no file would lose it without anyone asking.
const canReplace = (id, name) => {
  if (!contentOf(id).trim()) return true
  if (fileHandles[id] && !unsaved[id]) return true
  return confirm('Open "' + name + '"?\n\nThe ' + TABS[id].lang +
    ' editor has changes that are not in a file, and they will be replaced.')
}

// Separate from the wiring below so it can be driven directly: an installed
// launch is not something a page can stage for itself.
async function openLaunchedFiles(handles) {
  for (const handle of handles || []) {
    const id = paneFor(handle.name)
    if (!canReplace(id, handle.name)) continue
    if (id !== 'main') {
      // the css and js panes only exist while the project is html
      setLang('html')
      makeActive(id)
    }
    try {
      await openHandle(handle, id)
    } catch (err) {
      console.error('Failed to open', handle.name, err)
    }
  }
}

function wireFileHandler() {
  if (!('launchQueue' in window)) return
  window.launchQueue.setConsumer((params) => openLaunchedFiles(params && params.files))
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
        const err = new Error('HTTP ' + response.status)
        // a 404 means the theme is gone for good, not a passing network problem
        err.permanent = response.status === 404
        throw err
      }
      return response.json()
    })
    .then((data) => {
      monaco.editor.defineTheme(themeName, data)
      monaco.editor.setTheme(themeName)
    })
    .catch((err) => {
      // Fall back for this session only, and leave the stored choice alone.
      // Persisting the fallback meant any transient failure permanently reset
      // the user's theme - including the fetch simply being cancelled because
      // they reloaded the page right after picking one.
      console.error('Failed to load theme', themeName, err)
      monaco.editor.setTheme('vs-dark')
      if (err.permanent) {
        // the theme no longer exists, so stop asking for it on every load. A
        // transient failure deliberately keeps the stored choice instead.
        saveSettings({ theme: 'vs-dark' })
        gets('#theme').innerText = 'vs-dark'
        gets('#theme').setAttribute('data-type', 'vs-dark')
      }
    })
}

//---------------------------- formatting -----------------------------
// Prettier is a few hundred KB, so it is fetched the first time a format is
// actually asked for rather than on every page load.

const PRETTIER_BASE = 'https://unpkg.com/prettier@3'
const PRETTIER_PARSERS = { html: 'html', css: 'css', javascript: 'babel', json: 'json' }

let prettierReady = null

// Use the ESM build, not the UMD one. Monaco's AMD loader defines `define.amd`,
// and any UMD script loaded after it registers as an anonymous AMD module
// instead of creating the global it is supposed to - so `prettier` would come
// back undefined and formatting would silently do nothing.
const loadPrettier = () => {
  if (!prettierReady) {
    prettierReady = Promise.all([
      import(PRETTIER_BASE + '/standalone.mjs'),
      import(PRETTIER_BASE + '/plugins/html.mjs'),
      import(PRETTIER_BASE + '/plugins/postcss.mjs'),
      import(PRETTIER_BASE + '/plugins/babel.mjs'),
      import(PRETTIER_BASE + '/plugins/estree.mjs'),
    ]).then((mods) => ({
      format: mods[0].format,
      plugins: mods.slice(1).map((m) => m.default || m),
    })).catch((err) => {
      prettierReady = null   // so a later attempt can retry
      throw err
    })
  }
  return prettierReady
}

// Registered as real monaco providers, so the context menu entry, the keyboard
// shortcut and editor.action.formatDocument all go through the same path.
const registerFormatters = () => {
  Object.keys(PRETTIER_PARSERS).forEach((language) => {
    monaco.languages.registerDocumentFormattingEditProvider(language, {
      provideDocumentFormattingEdits: async (model) => {
        try {
          const engine = await loadPrettier()
          // format is async in prettier 3
          const text = await engine.format(model.getValue(), {
            parser: PRETTIER_PARSERS[language],
            plugins: engine.plugins,
          })
          return [{ range: model.getFullModelRange(), text: text }]
        } catch (err) {
          // returning no edits leaves the buffer exactly as it was, which is
          // what should happen when the code does not parse
          console.error('Could not format:', err.message)
          return []
        }
      },
    })
  })
}

//---------------------------- preview tab ----------------------------

// app.html builds and sandboxes the document for every language, so there is no
// longer a document.write path here. The old one opened about:blank, which is
// same-origin, meaning a previewed script could reach this page's storage.
function openWin() {
  flushStorage()
  window.open('./app.html', '_blank')
}

//------------------------------ projects ------------------------------
// One project is one record: its three files, its own settings, and the file
// handles of its panes. Exactly one is open at a time, and switching flushes
// the current one first so nothing in flight is lost.

// Called from bootQuickCode before any editor exists, because the editors are
// built out of the project's content.
async function loadWorkspace() {
  try {
    project = await openWorkspace()
  } catch (err) {
    // a private window, or storage the browser has blocked. The editor still
    // works for this session; nothing is kept.
    console.error('Could not open the project store', err)
    storeAvailable = false
    project = makeProject({ name: 'This session only' })
  }
  const fragment = sharedFragment()
  if (fragment) await importShared(fragment)
  Object.assign(quickEdit, settingsOf(project))
  localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
  await restoreHandles()
}

const restoreHandles = async () => {
  let found = {}
  if (storeAvailable && project) {
    try {
      found = await loadHandles(project.id, TAB_IDS)
    } catch (err) {
      found = {}
    }
  }
  TAB_IDS.forEach((id) => {
    fileHandles[id] = found[id] || null
    unsaved[id] = false
  })
  updateTitle()
}

// make a record the open one, and put it on the screen
const openRecord = async (record) => {
  // whatever the diff was showing belonged to the project being left
  closeDiff()
  project = record
  setActiveId(record.id)
  // the last project's file name must not follow us into this one's save dialog
  fileName = false
  Object.assign(quickEdit, settingsOf(record))
  localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
  await restoreHandles()
  applyProject()
  refreshHistory()
  pingPreview()
}

async function switchProject(id) {
  if (!project || id === project.id) return
  await flushStorage()
  const next = await getProject(id)
  if (next) await openRecord(next)
}

// the open record, pushed into the editors and the toolbar
function applyProject() {
  TAB_IDS.forEach((id) => {
    const ed = TABS[id].get()
    if (ed) syncValue(ed, readStored(TABS[id].key))
  })

  applyJsLang()

  const lang = quickEdit.lang
  gets('#lang').innerText = lang
  gets('#lang').setAttribute('data-type', lang)
  setLang(lang)
  if (lang === 'html') makeActive(quickEdit.tab)

  if (quickEdit.split) {
    splitMenu(quickEdit.splitLang)
  } else {
    singleEditor()
  }
  setSplitRatio(quickEdit.splitRatio)

  gets('#cssCheck').checked = Boolean(quickEdit.css)
  gets('#jsCheck').checked = Boolean(quickEdit.js)
  updateProjectLabel()
  updateTitle()
}

//------------------------------ sharing ------------------------------

// Left for initCore to show, so a bad link cannot block the editor being built.
let shareProblem = ''

// A shared link opens as a project of its own. It must never land on top of
// whatever was already open: that would be the data loss of item 01 with extra
// steps. The record that was open stays exactly as it was, in the list.
const importShared = async (fragment) => {
  try {
    const payload = await decodeShare(fragment)
    const shared = makeProject({
      name: payload.name ? payload.name + ' (shared)' : 'Shared snippet',
      code: payload.code || '',
      css: payload.css || '',
      js: payload.js || '',
      settings: Object.assign({}, PROJECT_SETTINGS, {
        lang: payload.lang || 'html',
        css: Boolean(payload.cssOn),
        js: Boolean(payload.jsOn),
      }),
    })
    if (storeAvailable) await saveProject(shared)
    project = shared
    setActiveId(shared.id)
  } catch (err) {
    console.error('Could not open that share link', err)
    shareProblem = err.message
  }
  // The link has been taken. Clearing it means a reload opens the project that
  // was imported rather than importing a second copy of it.
  history.replaceState(null, '', location.pathname + location.search)
}

// say something in the dialog itself, and put it back a few seconds later
const flash = (el, message) => {
  if (!el) return
  if (!el.dataset.label) el.dataset.label = el.textContent
  el.textContent = message
  clearTimeout(el.flashTimer)
  el.flashTimer = setTimeout(() => { el.textContent = el.dataset.label }, 8000)
}

async function copyShareLink() {
  const row = gets('#share')
  if (!project) return
  if (!shareSupported()) {
    flash(row, 'this browser cannot build share links')
    return
  }
  try {
    await flushStorage()
    const url = shareUrl(await encodeShare(project))
    let copied = true
    try {
      await navigator.clipboard.writeText(url)
    } catch (err) {
      // no clipboard, or permission refused: put it somewhere it can be copied
      copied = false
      gets('#filename').value = url
      gets('#filename').select()
    }
    const size = (url.length / 1024).toFixed(1) + ' KB'
    flash(row, (copied ? '\u2713 link copied' : 'copy the link from the box above') +
      ' \u00b7 ' + size + ' \u00b7 anyone with it can read your code' +
      (url.length > SHARE_WARN_BYTES ? ' \u00b7 too long for some chat apps, export instead' : ''))
  } catch (err) {
    console.error('Could not build a share link', err)
    flash(row, 'could not build a link: ' + err.message)
  }
}

//------------------------------ history ------------------------------
// The store is the save file, so a bad paste, a file opened into the wrong pane
// or a zip import used to be the end of it. Snapshots turn all of those from
// gone into annoying.
//
// Taken on three occasions: after a minute of quiet following an edit, right
// before anything that overwrites a pane wholesale, and when asked for.

// a let, not a const, so a test can shorten the wait
let SNAPSHOT_IDLE_MS = 60000
let snapshotTimer = null

const cancelSnapshot = () => {
  if (snapshotTimer !== null) {
    clearTimeout(snapshotTimer)
    snapshotTimer = null
  }
}

// Restarted by every change, so it fires once the typing stops rather than
// every minute regardless.
const scheduleSnapshot = () => {
  if (!storeAvailable || !project) return
  cancelSnapshot()
  snapshotTimer = setTimeout(() => {
    snapshotTimer = null
    snapshotNow('idle')
  }, SNAPSHOT_IDLE_MS)
}

// Returns the row, or null when nothing had changed since the last one.
async function snapshotNow(reason, title) {
  if (!storeAvailable || !project) return null
  cancelSnapshot()
  try {
    const row = await takeSnapshot(project, reason, title)
    if (row) refreshHistory()
    return row
  } catch (err) {
    console.error('Could not take a snapshot', err)
    return null
  }
}

// Only the deliberate ones are named. A prompt appearing a minute after you
// stopped typing, or in the middle of opening a file, would be unbearable.
async function snapshotWithTitle() {
  if (!project) return
  const title = prompt('Name this snapshot?', '')
  if (title === null) return                 // cancelled: take nothing
  const row = await snapshotNow('saved by hand', title.trim())
  if (!row) await refreshHistory()
}

async function removeSnapshot(id) {
  const row = await getSnapshot(id)
  if (!row) return
  if (!confirm('Delete the snapshot from ' + new Date(row.takenAt).toLocaleString() +
      '?\n\nThis one cannot be brought back.')) return
  await deleteSnapshots([id])
  closeDiffIfGone([id])
  await refreshHistory()
}

async function clearHistory() {
  if (!project) return
  const rows = await listSnapshots(project.id)
  if (!rows.length) return
  if (!confirm('Delete all ' + rows.length + ' snapshots of "' + project.name +
      '"?\n\nThe files stay exactly as they are; only the history goes.')) return
  const ids = rows.map((r) => r.id)
  await deleteSnapshots(ids)
  closeDiffIfGone(ids)
  await refreshHistory()
}

// Before anything that replaces a pane's contents outright. Awaited by its
// callers so the snapshot is on disk before the overwrite happens.
const snapshotBefore = (reason) => snapshotNow(reason)

const historyLabel = (row, previous) => {
  const when = new Date(row.takenAt)
  const time = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const lines = (text) => String(text || '').split('\n').length
  const total = (r) => lines(r.code) + lines(r.css) + lines(r.js)
  const delta = previous ? total(row) - total(previous) : 0
  const sign = delta > 0 ? '+' + delta : String(delta)
  // a name the user gave it says more than the reason it was taken for
  return time + '  ' + (row.title || row.reason) + (previous && delta !== 0 ? '  ' + sign : '')
}

async function refreshHistory() {
  const list = gets('#historyList')
  if (!list) return
  let rows = []
  try {
    rows = project ? await listSnapshots(project.id) : []
  } catch (err) {
    rows = []
  }
  list.innerHTML = ''
  if (!rows.length) {
    const empty = document.createElement('div')
    empty.className = 'option'
    empty.textContent = 'nothing saved yet'
    list.appendChild(empty)
  }
  rows.forEach((row, index) => {
    const item = document.createElement('div')
    item.className = 'option'
    item.setAttribute('data-snapshot', row.id)
    // rows[index + 1] is the one before it in time, the list being newest first
    item.textContent = historyLabel(row, rows[index + 1])
    const remove = document.createElement('span')
    remove.className = 'snapX'
    remove.setAttribute('data-delete-snapshot', row.id)
    remove.textContent = '\u00d7'
    item.appendChild(remove)
    // appended second, so it floats to the left of the cross
    const compare = document.createElement('span')
    compare.className = 'snapDiff'
    compare.setAttribute('data-diff-snapshot', row.id)
    compare.setAttribute('title', 'compare with what is open')
    compare.textContent = '\u21c4'
    item.appendChild(compare)
    list.appendChild(item)
  })
  const separator = document.createElement('div')
  separator.className = 'gradient'
  list.appendChild(separator)
  const actions = [
    { id: 'now', label: '+ snapshot now' },
    { id: 'clear', label: 'clear history' },
  ]
  actions.forEach((action) => {
    const item = document.createElement('div')
    item.className = 'option'
    item.setAttribute('data-history-action', action.id)
    item.textContent = action.label
    list.appendChild(item)
  })
}

// Restoring is itself an overwrite, so it takes a snapshot on the way in: the
// restore can be undone by restoring that one.
async function restoreSnapshot(id) {
  const row = await getSnapshot(id)
  if (!row) return
  const when = new Date(row.takenAt).toLocaleString()
  if (!confirm('Restore all three files as they were at ' + when + '?\n\n' +
      'What is open now is snapshotted first, so this can be undone.')) return
  await snapshotBefore('before-restore')
  TAB_IDS.forEach((id2) => setPaneText(id2, row[TABS[id2].key]))
  await flushStorage()
  await refreshHistory()
}

function wireHistory() {
  const list = gets('#historyList')
  if (!list) return
  refreshHistory()
  list.addEventListener('click', (e) => {
    // the delete cross sits inside the row, so it has to be looked for first or
    // every deletion would restore instead
    const cross = e.target.closest('[data-delete-snapshot]')
    if (cross) {
      e.stopPropagation()
      removeSnapshot(cross.getAttribute('data-delete-snapshot'))
        .catch((err) => console.error('Could not delete that snapshot', err))
      return
    }

    const compare = e.target.closest('[data-diff-snapshot]')
    if (compare) {
      e.stopPropagation()
      list.classList.remove('toggle')
      openDiff(compare.getAttribute('data-diff-snapshot'))
        .catch((err) => console.error('Could not open that comparison', err))
      return
    }

    const item = e.target.closest('[data-snapshot], [data-history-action]')
    if (!item) return
    const id = item.getAttribute('data-snapshot')
    if (id) {
      list.classList.remove('toggle')
      restoreSnapshot(id).catch((err) => console.error('Could not restore that', err))
      return
    }
    // the menu stays open for these: you often want another one straight after
    const action = item.getAttribute('data-history-action')
    const run = action === 'clear' ? clearHistory : snapshotWithTitle
    run().catch((err) => console.error('That did not work', err))
  })
}

//------------------------- the project picker ------------------------

const updateProjectLabel = () => {
  const btn = gets('#project')
  if (btn && project) btn.innerText = project.name
}

async function newProject() {
  const name = prompt('Name for the new project?', 'Untitled')
  if (name === null) return
  await flushStorage()
  const created = makeProject({ name: name.trim() || 'Untitled' })
  await saveProject(created)
  await openRecord(created)
  await refreshProjects()
}

async function renameProject() {
  if (!project) return
  const name = prompt('Rename this project to?', project.name)
  if (name === null) return
  project.name = name.trim() || project.name
  await flushStorage()
  updateProjectLabel()
  await refreshProjects()
}

// The copy deliberately does not inherit the file handles: it would otherwise
// save straight over the files of the project it was copied from.
async function duplicateProject() {
  if (!project) return
  await flushStorage()
  const copy = makeProject({
    name: project.name + ' copy',
    code: readStored('code'),
    css: readStored('css'),
    js: readStored('js'),
    settings: Object.assign({}, project.settings),
  })
  await saveProject(copy)
  await openRecord(copy)
  await refreshProjects()
}

async function removeProject() {
  if (!project) return
  if (!confirm('Delete "' + project.name + '"?\n\nIts three files go with it, and this cannot be undone.')) return
  // a queued write would put the record straight back
  cancelFlush()
  const goneId = project.id
  await deleteProject(goneId)
  await forgetHandles(goneId, TAB_IDS)
  await dropSnapshotsFor(goneId).catch((err) => console.error('Could not clear its history', err))
  const rest = (await listProjects()).filter((p) => p.id !== goneId)
  // there is always a project open: an empty one is a better landing place
  // than a blank screen with nothing to type into
  const next = rest[0] || makeProject({})
  if (!rest.length) await saveProject(next)
  await openRecord(next)
  await refreshProjects()
}

const PROJECT_ACTIONS = [
  { id: 'new', label: '+ new project', run: newProject },
  { id: 'rename', label: 'rename', run: renameProject },
  { id: 'duplicate', label: 'duplicate', run: duplicateProject },
  { id: 'delete', label: 'delete', run: removeProject },
]

async function refreshProjects() {
  const list = gets('#projectList')
  if (!list) return
  let all = []
  try {
    all = await listProjects()
  } catch (err) {
    all = project ? [project] : []
  }
  list.innerHTML = ''
  all.forEach((p) => {
    const row = document.createElement('div')
    row.className = 'option' + (project && p.id === project.id ? ' active-project' : '')
    row.setAttribute('data-project', p.id)
    // textContent, never innerHTML: the name is whatever was typed into a prompt
    row.textContent = p.name
    list.appendChild(row)
  })
  const separator = document.createElement('div')
  separator.className = 'gradient'
  list.appendChild(separator)
  PROJECT_ACTIONS.forEach((action) => {
    const row = document.createElement('div')
    row.className = 'option'
    row.setAttribute('data-action', action.id)
    row.textContent = action.label
    list.appendChild(row)
  })
}

function wireProjects() {
  const list = gets('#projectList')
  if (!list) return
  updateProjectLabel()
  refreshProjects()

  // delegated, because the rows are rebuilt every time a project appears or
  // goes away
  list.addEventListener('click', (e) => {
    const row = e.target.closest('[data-project], [data-action]')
    if (!row) return
    list.classList.remove('toggle')
    const id = row.getAttribute('data-project')
    if (id) {
      switchProject(id).catch((err) => console.error('Could not open that project', err))
      return
    }
    const action = PROJECT_ACTIONS.filter((a) => a.id === row.getAttribute('data-action'))[0]
    if (action) action.run().catch((err) => console.error('That did not work', err))
  })
}

//---------------------------- preview pane ---------------------------
// The preview is the fourth tab of the split view, so it inherits the drag
// handle, the remembered ratio and the show/hide that the editor panes already
// had. Under it sits the console: without it a snippet that throws does nothing
// visible, because the error lands in a tab nobody is looking at.

const PREVIEW_LANG = 'preview'
const PREVIEW_DEBOUNCE_MS = 400
const CONSOLE_LIMIT = 300

let previewSources = {}
let previewTimer = null
// turned off by stop, so a snippet that hangs the frame can be stopped rather
// than being started again on the next keystroke
let previewLive = true

const previewShowing = () => quickEdit.split && quickEdit.splitLang === PREVIEW_LANG

// Numbered, because compiling TypeScript is a worker round trip and two
// renders can overlap: an older one finishing last would paint over the newer.
let previewRender = 0

async function renderPreview() {
  const frame = gets('#previewFrame')
  if (!frame || !previewShowing()) return
  clearTimeout(previewTimer)
  previewTimer = null
  const mine = ++previewRender
  const js = await jsForPreview(readStored('js'))
  if (mine !== previewRender || !previewShowing()) return
  const built = buildPreviewDoc({
    code: readStored('code'), css: readStored('css'), js: js,
  }, quickEdit)
  previewSources = built.sources
  frame.srcdoc = built.html
  // After the render, not before it: the markup and the css are worth showing
  // even when an import cannot be had, and this asks the network.
  reportImportProblems([readStored('code'), js])
    .catch((err) => console.error('Could not check the imports', err))
}

function schedulePreview() {
  if (!previewShowing() || !previewLive) return
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    renderPreview().catch((err) => console.error('Could not build the preview', err))
  }, PREVIEW_DEBOUNCE_MS)
}

// Navigating the frame is what actually kills a script that is still running,
// which a stop button has to be able to do.
function stopPreview() {
  previewLive = false
  clearTimeout(previewTimer)
  previewTimer = null
  const frame = gets('#previewFrame')
  if (frame) frame.srcdoc = ''
  logToConsole({ kind: 'info', args: ['stopped'] })
}

function runPreview() {
  previewLive = true
  renderPreview().catch((err) => console.error('Could not build the preview', err))
}

//------------------------------ the console --------------------------

const consoleRows = () => gets('#consoleOut')

const clearConsole = () => {
  const out = consoleRows()
  if (!out) return
  out.innerHTML = ''
  const empty = document.createElement('div')
  empty.className = 'logEmpty'
  empty.textContent = 'nothing yet'
  out.appendChild(empty)
}

function logToConsole(message) {
  const out = consoleRows()
  if (!out) return
  const placeholder = out.querySelector('.logEmpty')
  if (placeholder) placeholder.remove()

  const row = document.createElement('div')
  // compile rows are marked so the next compile can replace them
  // compile and import rows are marked so the next report can replace them
  row.className = 'logRow log-' + (message.kind || 'log') +
    (message.compile ? ' log-compile' : '') + (message.importProblem ? ' log-import' : '')
  // textContent, never innerHTML: this is output from code we did not write
  row.textContent = (message.args || []).join('  ')

  // A compile problem knows exactly where it is; everything else arrives as a
  // line of the generated document and has to be worked back.
  let where = message.where || previewLocation(previewSources, message.file, message.line)
  // What ran was the compiled javascript, so a line number from it is not a
  // line of what was written. Say which line it really was, or say nothing -
  // the rule preview.js already follows about confidently wrong numbers.
  if (where && where.pane === 'js' && !message.where && usingTypeScript()) {
    const line = tsSourceLine(where.line)
    where = line ? { pane: 'js', line: line } : null
  }
  if (where) {
    const tag = document.createElement('span')
    tag.className = 'logWhere'
    tag.textContent = paneLabel(where.pane) + ':' + where.line
    row.appendChild(tag)
  }

  out.appendChild(row)
  while (out.children.length > CONSOLE_LIMIT) {
    out.removeChild(out.firstChild)
  }
  out.scrollTop = out.scrollHeight
}

// The main pane is whatever language it is set to; the js pane says which
// flavour it is, because ts:9 and js:9 are not the same line.
const paneLabel = (pane) => {
  if (pane === 'main') return quickEdit.lang
  if (pane === 'js') return usingTypeScript() ? 'ts' : 'js'
  return pane
}

// A module whose import cannot be fetched runs nothing and says nothing - not
// even an error event. Asking esm.sh first is the only way the console can say
// anything at all, so this is where that happens.
async function reportImportProblems(texts) {
  if (!consoleRows()) return
  let problems = []
  try {
    problems = await importProblems(texts)
  } catch (err) {
    return                        // a broken check must not become a broken preview
  }
  if (!consoleRows()) return
  getsAll('#consoleOut .log-import').forEach((row) => row.remove())
  problems.forEach((message) => logToConsole({ kind: 'error', importProblem: true, args: [message] }))
}

// What the compiler thinks is a current state, not a history: a new report
// replaces the last one rather than adding a row per keystroke.
function reportCompileProblems(result) {
  if (!consoleRows()) return
  getsAll('#consoleOut .log-compile').forEach((row) => row.remove())
  const say = (problems, kind, prefix) => {
    (problems || []).forEach((p) => logToConsole({
      kind: kind,
      compile: true,
      args: [prefix + p.message],
      where: { pane: 'js', line: p.line },
    }))
  }
  // a syntax error stopped it running at all; a type error only means the
  // compiler disagrees with you, and the javascript ran anyway
  say(result.errors, 'error', 'Will not compile: ')
  say(result.warnings, 'warn', 'Type error: ')
}

//----------------------- the js pane's flavour -----------------------

const updateJsLangBadge = () => {
  const badge = gets('#jsLang')
  if (!badge) return
  badge.textContent = usingTypeScript() ? 'ts' : 'js'
  badge.classList.toggle('on', usingTypeScript())
}

// Retargets the model rather than rebuilding the editor, so the text, the undo
// stack and the cursor all stay exactly where they were.
function setJsLang(flavour) {
  if (JS_FLAVOURS.indexOf(flavour) < 0) return
  saveSettings({ jsLang: flavour })
  applyJsLang()
  // whatever was compiled belongs to the other flavour now
  forgetCompiled()
  schedulePreview()
  pingPreview()
}

// Puts the current flavour on the panes that show the js file. Called on a
// switch, and again whenever a project is opened, since it is the project's.
function applyJsLang() {
  const ed = TABS.js.get()
  if (ed) monaco.editor.setModelLanguage(ed.getModel(), langOf('js'))
  if (splitEditor && SPLIT_TABS[quickEdit.splitLang] === 'js') {
    monaco.editor.setModelLanguage(splitEditor.getModel(), langOf('js'))
  }
  updateJsLangBadge()
}

function wirePreview() {
  clearConsole()
  onClick(gets('#previewRun'), runPreview)
  onClick(gets('#previewStop'), stopPreview)
  onClick(gets('#consoleClear'), clearConsole)

  window.addEventListener('message', (e) => {
    const frame = gets('#previewFrame')
    // A sandboxed frame has an opaque origin, so e.origin is the string "null"
    // and proves nothing. Identity has to come from the source window - any
    // page anywhere can post a message to this one.
    if (!frame || e.source !== frame.contentWindow) return
    const data = e.data
    if (!data || data.__qc !== true) return
    logToConsole(data)
  })
}

// The split pane can show one of three things: the editor, the live preview,
// or a diff against a snapshot. They are mutually exclusive, and this is the
// only place that decides which - a second opinion about it leaves the pane
// showing nothing at all.
const SPLIT_PANES = { editor: ['#splitEditor', 'block'], preview: ['#previewPane', 'flex'], diff: ['#diffPane', 'flex'] }

function showSplitPane(which) {
  Object.keys(SPLIT_PANES).forEach((name) => {
    const el = gets(SPLIT_PANES[name][0])
    if (el) el.style.display = name === which ? SPLIT_PANES[name][1] : 'none'
  })
  // showing the preview means building it
  if (which === 'preview') {
    previewLive = true
    renderPreview()
  }
}

// what the pane shows when nothing is borrowing it
const splitPaneDefault = () => (previewShowing() ? 'preview' : 'editor')

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
  // each pane has its own file, so the title changes with the tab
  updateTitle()
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
  // the library also ships a CSS mode; without it the css pane had no
  // abbreviations at all (m10 -> margin: 10px, df -> display: flex)
  emmetMonaco.emmetCSS(monaco)

  // the preview window reads the settings from here
  localStorage.setItem('quickEdit', JSON.stringify(quickEdit))

  // Never lose queued text. The snapshot is what actually saves it: an
  // IndexedDB write started here cannot be relied on to finish before the page
  // goes away, while localStorage.setItem is synchronous and always lands.
  const persistNow = () => {
    flushStorage()
    snapshot(project)
  }
  window.addEventListener('pagehide', persistNow)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persistNow()
  })

  ext = extFor(quickEdit.lang)
  gets('#lang').innerText = quickEdit.lang
  gets('#theme').innerText = quickEdit.theme
  gets('#filename').value = 'file.' + ext

  settheme(quickEdit.theme)
  configureTypeScript()
  registerFormatters()
  ensureMainEditor()
  updateJsLangBadge()

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
  wireFileHandler()
  wireProjects()
  wireHistory()
  wirePreview()
  wireDiff()

  if (shareProblem) {
    // after this turn of the loop, so the editor is on screen behind it rather
    // than the page being blocked half-built
    const reason = shareProblem
    shareProblem = ''
    setTimeout(() => alert('That share link could not be opened: ' + reason), 0)
  }
}

function wireToolbar() {
  // save dialog
  onClick(gets('#save'), showOverlay)
  onClick(gets('#savefile'), saveFromOverlay)
  gets('#overlay').addEventListener('click', hideOverlay)
  gets('.box').addEventListener('click', (e) => e.stopPropagation())
  gets('#filename').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveFromOverlay()
  })
  document.addEventListener('keydown', (e) => {
    // e.which is deprecated, and without preventDefault the browser's own
    // save dialog can open on top of ours
    if (e.key !== 's' && e.key !== 'S') return
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    if (e.shiftKey) {
      showOverlay()          // Save as, always
    } else {
      quickSave()            // straight to the file when the pane has one
    }
  })

  // Open. Where the picker exists it replaces the hidden input, and
  // preventDefault stops the label activating that input as well - otherwise
  // one click opens two dialogs.
  const openLabel = gets('label[for="file"]')
  if (openLabel) {
    openLabel.addEventListener('click', (e) => {
      if (!hasFilePicker()) return
      e.preventDefault()
      openWithPicker()
    })
  }

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
  onClick(gets('#share'), copyShareLink)
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

  // the flavour badge sits inside the js tab, so like the checkboxes below it
  // must not also switch tabs
  const badge = gets('#jsLang')
  if (badge) {
    badge.addEventListener('click', (e) => {
      e.stopPropagation()
      setJsLang(usingTypeScript() ? 'javascript' : 'typescript')
    })
  }

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
  // the project list builds its options as projects come and go, and wires
  // them itself
  const apply = { selectA: setLang, selectB: settheme }
  getsAll('.selectA .option, .selectB .option').forEach((opt) => {
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

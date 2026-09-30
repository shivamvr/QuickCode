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

const defaultSettings = { theme: 'vs-dark', vnav: false, lang: 'html', tab: 'main', js: false, css: false, split: false, splitLang: 'html', splitRatio: 0.5 }

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
}

// app.html rebuilds the preview whenever localStorage changes. Content does not
// go through localStorage any more, so it needs a nudge of its own; it arrives
// after the write lands, so the preview never shows something that was not
// saved.
const pingPreview = () => {
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
    openText(id, file.name, String(reader.result))
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
  Object.assign(quickEdit, project.settings)
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
  project = record
  setActiveId(record.id)
  // the last project's file name must not follow us into this one's save dialog
  fileName = false
  Object.assign(quickEdit, record.settings)
  localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
  await restoreHandles()
  applyProject()
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
  registerFormatters()
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
  wireFileHandler()
  wireProjects()
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

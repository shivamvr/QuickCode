//=====================================================================
// The project store.
//
// Content used to live in three localStorage keys, which meant exactly one
// project: starting anything new overwrote the last thing. It also meant a 5MB
// ceiling shared with everything else on this origin, and a synchronous write
// on the main thread for every change.
//
// It now lives in IndexedDB, one record per project. Nothing outside this file
// talks to the database: index.js still reads and writes through the same
// readStored / writeSoon / flushStorage it always did, and app.html asks for
// the active project.
//=====================================================================

const DB_NAME = 'quickcode'
// 2 added the snapshots store. The upgrade only creates what is missing, so an
// existing database gains it without touching anything already there.
const DB_VERSION = 2
const PROJECTS = 'projects'
const HANDLES = 'handles'
const META = 'meta'
const SNAPSHOTS = 'snapshots'

// Which project is open. Kept in localStorage rather than the database because
// it is one short string, it is needed synchronously, and the preview window
// reads it before it has opened anything.
const ACTIVE_KEY = 'quickcodeActive'

// Written synchronously as the page goes away; see snapshot() below.
const SNAPSHOT_KEY = 'quickcodeUnsaved'

let dbPromise = null

const openDb = () => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(PROJECTS)) {
          db.createObjectStore(PROJECTS, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
        }
        // FileSystemFileHandle objects are structured cloneable, so they store
        // directly - which is what lets a reopened project still know which
        // file each pane came from
        if (!db.objectStoreNames.contains(HANDLES)) {
          db.createObjectStore(HANDLES, { keyPath: 'id' })
        }
        // one row, saying the pre-IndexedDB content has been taken. It lives
        // here rather than in localStorage so it cannot get out of step with
        // the projects it guards - clearing one and not the other would
        // otherwise resurrect deleted work.
        if (!db.objectStoreNames.contains(META)) {
          db.createObjectStore(META, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(SNAPSHOTS)) {
          db.createObjectStore(SNAPSHOTS, { keyPath: 'id' }).createIndex('projectId', 'projectId')
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error('another tab is holding an older version of the database'))
    })
  }
  return dbPromise
}

// one transaction per call: they auto-close, and nothing here is hot enough to
// be worth sharing one
const runTx = async (store, mode, fn) => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const req = fn(tx.objectStore(store))
    tx.oncomplete = () => resolve(req ? req.result : undefined)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

const dbGet = (store, key) => runTx(store, 'readonly', (s) => s.get(key))
const dbAll = (store) => runTx(store, 'readonly', (s) => s.getAll())
const dbPut = (store, value) => runTx(store, 'readwrite', (s) => s.put(value))
const dbDelete = (store, key) => runTx(store, 'readwrite', (s) => s.delete(key))

//---------------------------- the records ----------------------------

// Settings that belong to a project rather than to the app. Carrying these
// globally would mean switching projects landed you on the wrong tab, in the
// wrong language, with someone else's split open.
const PROJECT_SETTINGS = {
  lang: 'html', tab: 'main', js: false, css: false,
  split: false, splitLang: 'html', splitRatio: 0.5,
  jsLang: 'javascript',
}

// A record written before a setting existed does not have it. Assigning its
// settings straight over the live ones would then leave the last project's
// value in place - so a project saved without jsLang would inherit whatever the
// one before it was using. Every read goes through here instead.
const settingsOf = (record) => Object.assign({}, PROJECT_SETTINGS, (record && record.settings) || {})

const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const makeProject = (fields) => Object.assign({
  id: newId(),
  name: 'My project',
  code: '',
  css: '',
  js: '',
  settings: Object.assign({}, PROJECT_SETTINGS),
  createdAt: Date.now(),
  updatedAt: Date.now(),
}, fields)

const activeId = () => localStorage.getItem(ACTIVE_KEY) || ''
const setActiveId = (id) => localStorage.setItem(ACTIVE_KEY, id)

const listProjects = () => dbAll(PROJECTS).then((all) => all.sort((a, b) => b.updatedAt - a.updatedAt))
const getProject = (id) => dbGet(PROJECTS, id)
const deleteProject = (id) => dbDelete(PROJECTS, id)

const saveProject = (project) => {
  project.updatedAt = Date.now()
  return dbPut(PROJECTS, project)
}

//------------------------- per-pane file handles ----------------------
// Keyed by project and pane, so reopening a project knows which file each pane
// came from. The permission to write is not restored with it: that has to be
// asked for inside a user gesture, which the first Ctrl+S provides.

const handleKey = (projectId, pane) => projectId + ':' + pane

const saveHandle = (projectId, pane, handle) => handle
  ? dbPut(HANDLES, { id: handleKey(projectId, pane), handle: handle })
  : dbDelete(HANDLES, handleKey(projectId, pane))

const loadHandles = async (projectId, panes) => {
  const found = {}
  for (const pane of panes) {
    try {
      const row = await dbGet(HANDLES, handleKey(projectId, pane))
      found[pane] = (row && row.handle) || null
    } catch (err) {
      found[pane] = null
    }
  }
  return found
}

const forgetHandles = (projectId, panes) => Promise.all(
  panes.map((pane) => dbDelete(HANDLES, handleKey(projectId, pane)).catch(() => {})))

//---------------------------- snapshots ------------------------------
// The store is the save file, so without these there is no way back from a bad
// paste, a file opened into the wrong pane, or a zip import. Whole copies, not
// diffs: three panes of text are small, and a diff engine for a few KB would be
// more to go wrong than it saves.

// how many of the newest are always kept, whatever their age
const SNAPSHOT_KEEP_RECENT = 10
// the hard ceiling per project
const SNAPSHOT_MAX = 50

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// djb2 over the three panes, to skip writing a snapshot identical to the last
const contentHash = (a, b, c) => {
  const text = a + '\u0000' + b + '\u0000' + c
  let hash = 5381
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  }
  return String(hash)
}

const listSnapshots = (projectId) =>
  runTx(SNAPSHOTS, 'readonly', (store) => store.index('projectId').getAll(projectId))
    .then((rows) => (rows || []).sort((a, b) => b.takenAt - a.takenAt))

const getSnapshot = (id) => dbGet(SNAPSHOTS, id)

const deleteSnapshots = (ids) =>
  runTx(SNAPSHOTS, 'readwrite', (store) => {
    ids.forEach((id) => store.delete(id))
    return null
  })

const dropSnapshotsFor = (projectId) =>
  listSnapshots(projectId).then((rows) => deleteSnapshots(rows.map((r) => r.id)))

// Which snapshots to keep: everything recent, then one an hour for the first
// day and one a day after that. Written here rather than "later" on purpose -
// capture without pruning grows without bound.
const chooseKept = (rows, now) => {
  const keep = []
  const buckets = {}
  rows.forEach((row, index) => {
    if (keep.length >= SNAPSHOT_MAX) return
    if (index < SNAPSHOT_KEEP_RECENT) {
      keep.push(row)
      return
    }
    const age = now - row.takenAt
    const bucket = age < DAY
      ? 'h' + Math.floor(row.takenAt / HOUR)
      : 'd' + Math.floor(row.takenAt / DAY)
    if (!buckets[bucket]) {
      buckets[bucket] = true
      keep.push(row)
    }
  })
  return keep
}

// Writes one unless it would be identical to the last. Returns the row, or null
// when nothing had changed.
//
// A title is only ever given by hand. Naming a state that is already the latest
// snapshot renames that one rather than storing a second copy of it: the point
// of the name is to mark this state, and it is already here.
const takeSnapshot = async (record, reason, title) => {
  const hash = contentHash(record.code || '', record.css || '', record.js || '')
  const rows = await listSnapshots(record.id)
  if (rows.length && rows[0].hash === hash) {
    if (!title) return null
    rows[0].title = title
    await dbPut(SNAPSHOTS, rows[0])
    return rows[0]
  }

  const row = {
    id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    projectId: record.id,
    takenAt: Date.now(),
    reason: reason || 'idle',
    title: title || '',
    hash: hash,
    code: record.code || '',
    css: record.css || '',
    js: record.js || '',
  }
  await dbPut(SNAPSHOTS, row)

  const all = [row].concat(rows)
  const keep = chooseKept(all, row.takenAt)
  const kept = {}
  keep.forEach((r) => { kept[r.id] = true })
  const drop = all.filter((r) => !kept[r.id]).map((r) => r.id)
  if (drop.length) await deleteSnapshots(drop)

  return row
}

//--------------------------- the crash net ---------------------------
// An IndexedDB write cannot be relied on to finish while the page is going
// away, and the batching that keeps typing smooth means up to a few hundred
// milliseconds may not have reached the database yet. localStorage.setItem is
// synchronous and always lands, so the last state is dropped there on the way
// out and adopted on the way back in.

const snapshot = (project) => {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
      id: project.id, code: project.code, css: project.css, js: project.js,
    }))
  } catch (err) {
    // a full or disabled localStorage is not worth failing the unload over
  }
}

const adoptSnapshot = async () => {
  let saved
  try {
    saved = JSON.parse(localStorage.getItem(SNAPSHOT_KEY))
  } catch (err) {
    saved = null
  }
  localStorage.removeItem(SNAPSHOT_KEY)
  if (!saved || !saved.id) return
  const project = await getProject(saved.id)
  // the snapshot is always at least as new as the record: it is written last
  if (!project) return
  project.code = saved.code
  project.css = saved.css
  project.js = saved.js
  await saveProject(project)
}

//---------------------------- the migration --------------------------
// The pre-IndexedDB keys are read once and then given one load of grace: the
// boot that migrates leaves them alone, and the next one removes them. Until
// the work has come back out of the store at least once, they are the only copy
// of it.

const LEGACY_CONTENT_KEYS = ['code', 'css', 'js']

const dropLegacyContent = () => {
  LEGACY_CONTENT_KEYS.forEach((key) => localStorage.removeItem(key))
}

const legacyContent = () => {
  const code = localStorage.getItem('code')
  const css = localStorage.getItem('css')
  const js = localStorage.getItem('js')
  if (code === null && css === null && js === null) return null
  if (!(code || css || js)) return null
  return { code: code || '', css: css || '', js: js || '' }
}

const migrate = async () => {
  if (await dbGet(META, 'migrated')) return null
  await dbPut(META, { id: 'migrated', at: Date.now() })
  const legacy = legacyContent()
  if (!legacy) return null

  let settings = {}
  try {
    settings = JSON.parse(localStorage.getItem('quickEdit')) || {}
  } catch (err) {
    settings = {}
  }
  const kept = {}
  Object.keys(PROJECT_SETTINGS).forEach((key) => {
    kept[key] = settings[key] === undefined ? PROJECT_SETTINGS[key] : settings[key]
  })
  return makeProject(Object.assign({ name: 'My project', settings: kept }, legacy))
}

//------------------------------- boot --------------------------------

// Everything above is only reachable through this. Returns the project to open,
// after migrating a pre-IndexedDB install and recovering anything the last
// session did not manage to write.
const openWorkspace = async () => {
  await adoptSnapshot().catch((err) => console.error('Could not recover the last session', err))

  let migratedNow = false
  let projects = await listProjects()
  if (!projects.length) {
    const adopted = await migrate()
    migratedNow = !!adopted
    const project = adopted || makeProject({})
    await saveProject(project)
    projects = [project]
  }

  let project = projects.filter((p) => p.id === activeId())[0]
  if (!project) {
    project = projects[0]          // most recently updated
    setActiveId(project.id)
  }

  // Reaching this line means the store answered and a project came out of it,
  // so the pre-IndexedDB copies have done their job. Not on the load that
  // migrated, though: one more load of grace costs nothing, and it means the
  // session that wrote the new copy is never the one that deletes the old.
  //
  // This is also why the guard lives in the store rather than in localStorage.
  // If the database is ever wiped, the guard goes with it, migrate() runs again
  // and finds the keys still there - so the grace period restarts instead of
  // the work being gone.
  if (!migratedNow) dropLegacyContent()
  return project
}

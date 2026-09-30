# 04 — IndexedDB and multiple projects

**Size:** L · **Depends on:** 01 · **Status:** done (see Outcome)

## Why

There is exactly **one** project. Storage holds one `code`, one `css`, one `js`
([scripts/index.js:81](../scripts/index.js#L81)), so starting anything new
overwrites the last thing. That is the difference between a scratchpad and a
place where work lives, and it is the biggest functional gap in the tool.

`localStorage` is also the wrong home for it:

- **5 MB cap**, shared across the whole origin
- **synchronous** — every write blocks the main thread, which is why writes had
  to be batched behind `writeSoon()` in the first place
- strings only, so no metadata without another layer of JSON

IndexedDB is asynchronous, effectively unbounded, and stores structured values —
including `FileSystemFileHandle` objects, which item 02 needs to persist.

## What changes

This is the invasive one. Split it into three commits:

1. **A storage layer behind the current API.** Keep `readStored` / `writeSoon` /
   `flushStorage` as the only way content is touched, and move their backing
   store to IndexedDB. Nothing else in the codebase changes.
2. **A project record.** One project = `{ id, name, code, css, js, settings,
   createdAt, updatedAt }`. The active project id lives in `localStorage` (tiny,
   synchronous, fine).
3. **The picker UI.** New/rename/duplicate/delete, and a list to switch.

## The migration problem

`readStored()` is **synchronous** and is called during startup —
`ensureMainEditor()` passes `readStored('code')` straight into
`monaco.editor.create` ([scripts/index.js:125](../scripts/index.js#L125)).
IndexedDB is async, so this cannot be a like-for-like swap.

The clean way: make `bootQuickCode()` async and load the active project *before*
creating any editor.

```js
// index.html
require(['vs/editor/editor.main'], () => { bootQuickCode() })

// eventListener.js
async function bootQuickCode() {
  await loadActiveProject()   // fills an in-memory cache
  initCore()
  wireSplit()
}
```

Then `readStored()` reads from that in-memory cache, staying synchronous for all
its existing callers, and `writeSoon()` queues into the cache plus an async
IndexedDB write. The batching logic that exists today carries over unchanged —
it was written for exactly this shape.

**Migrate on first run** and keep it idempotent:

```js
// if the old localStorage keys exist and no project does, adopt them
if (!(await anyProject()) && localStorage.getItem('code') !== null) {
  await createProject({
    name: 'Imported',
    code: localStorage.getItem('code'),
    css: localStorage.getItem('css'),
    js: localStorage.getItem('js'),
  })
  // leave the old keys in place for one release as a safety net
}
```

Do **not** delete the old keys in the same release. If the migration has a bug,
those keys are the only copy of the user's work.

## Schema sketch

```
db: quickcode (version 1)
  store: projects   keyPath 'id'      index: 'updatedAt'
  store: handles    keyPath 'id'      // FileSystemFileHandle per project+pane (item 02)
```

Settings: keep the global ones (`theme`, `vnav`) global, and make the
per-project ones (`lang`, `tab`, `split`, `splitLang`, `css`, `js` toggles) part
of the project record. Otherwise switching projects carries the wrong tab state
across.

## Verification

- **Migration:** seed the old `localStorage` keys, load, and confirm a project
  appears with exactly that content and nothing is lost. Run it twice and
  confirm the second load does not create a duplicate.
- **Isolation:** create two projects with different content, switch between them
  repeatedly, and confirm no bleed in any of the three panes.
- Batching still holds: 40 keystrokes produce no synchronous storage stall, and
  `flushStorage()` before save/export still yields current text.
- Reload restores the active project, its tab, and its split state.
- Delete the active project and confirm the app lands somewhere sane rather than
  on a blank screen.

## Risks

- **This is the item most likely to lose data.** Write the migration first, test
  it against a seeded old-format store, and keep the legacy keys for a release.
- Making boot async means anything that runs before `await` must not touch the
  editors. The lazy `ensure*Editor()` pattern already protects most of this.
- Quota: IndexedDB is generous but not infinite, and eviction is possible under
  storage pressure. Call `navigator.storage.persist()` once the user has real
  projects.
- Scope creep is the other risk — the picker UI can absorb unlimited time. Ship
  commit 1 (storage swap, single project, no UI) and confirm nothing regressed
  before building any interface.

## Done when

Two projects can coexist, be switched between without content bleeding, survive
a reload, and an existing single-project install migrates into the new store with
nothing lost.

## Outcome

**Done, September 2026.** Work lives in named projects in IndexedDB. Two can
coexist, switching between them carries nothing across, and an install from
before this migrates with its content intact.

### What was built

- **`scripts/store.js`** - the only thing that talks to the database. Three
  stores: `projects` (keyPath `id`, indexed on `updatedAt`), `handles` (a
  `FileSystemFileHandle` per project and pane), and `meta` (one row, saying the
  old content has been taken).
- **`scripts/index.js`** - `readStored` / `writeSoon` / `flushStorage` kept
  their names and their callers; the open record is now the in-memory cache they
  work against. Plus the project lifecycle: `loadWorkspace`, `switchProject`,
  `applyProject`, and new/rename/duplicate/delete.
- **The picker** is a third `.select` dropdown, built from the classes the
  language and theme dropdowns already use, so it inherits the toolbar's look
  exactly and adds no colours of its own. Names come from `prompt()` and
  deletion asks with `confirm()` - no new dialog, no new CSS beyond one
  `font-weight` for the open project.

### The shape that made it possible

The plan's suggestion was right: `readStored()` is called synchronously while
the first editor is being created, so the switch could not be a like-for-like
swap. `bootQuickCode()` is now async and loads the project **before** any editor
exists, and the record it loads *is* the cache - a keystroke lands on it
immediately and only the write out to the database is batched. Every existing
caller stayed exactly as it was.

Settings split the way the plan described: the theme and the toolbar layout stay
global, everything else (language, tab, split, preview toggles) belongs to the
project. `quickEdit` is still the one flat object everything reads;
`saveSettings()` routes each key to the right home.

### Three things worth knowing

**The preview window had to change too, and the plan did not mention it.**
`app.html` read the three files straight out of `localStorage` and rebuilt
itself on the `storage` event. It now reads the active project out of the same
database. The `storage` event is still the signal - a short revision counter is
written to `localStorage` **after** each database write lands, so the preview is
never showing something that was not saved.

**A crash net, because this is the item most likely to lose data.** Writes are
batched 300ms, and an IndexedDB write started as the page goes away cannot be
relied on to finish - where `localStorage.setItem` always did. So `pagehide`
also drops a synchronous snapshot into `localStorage`, boot adopts it, and a
successful flush clears it. The invariant is simple: a snapshot exists only
while something may be unwritten.

**The migration guard moved into the database.** It was a `localStorage` flag at
first, which the test caught out: clear localStorage and the flag goes while the
projects stay, so emptying the store re-imported the old content over the top.
The flag now lives in the `meta` store, next to the data it guards.

### Verification

`node test/run.js` - **80 checks**, all passing, including a new **`migrate`
scenario** that loads over a seeded pre-IndexedDB `localStorage`, reloads, and
checks the migration did not run twice.

What is covered:

- two projects switched between repeatedly with no bleed in any of the three
  panes, each keeping its own tab and split state
- a duplicate is a separate record; deleting the open project opens another
- 40 keystrokes cause **zero** database writes and zero synchronous ones, and a
  flush puts the text in the record
- the crash-net snapshot is taken, adopted, and cleared
- a **real** `FileSystemFileHandle` survives the handles store, and the file a
  pane was editing comes back after a reload with the title naming it
- the migration takes the old keys' content and settings, leaves the old keys in
  place, does not run twice, and does not resurrect deleted work
- the preview window reads the project, and the sandboxed snippet still cannot
  reach it

Mutation-checked: not re-syncing the panes on switch, dropping the migration
guard, and removing the snapshot each turned the suite red.

### Left for later

- **Directory handles.** `showDirectoryPicker()` reading a folder as a project
  is the natural replacement for zip import/export, and now has somewhere to
  live. It is a self-contained follow-on rather than part of this.
- **`navigator.storage.persist()`.** Worth calling once someone has real
  projects, so eviction under storage pressure is less likely. Not called yet -
  it prompts in some browsers, and the right moment for that is a decision of
  its own.
- ~~**The legacy `code` / `css` / `js` keys.**~~ **Done, September 2026.**
  `openWorkspace` clears them once a project has come back out of the store, and
  never on the load that migrated - one load of grace, so the session that
  writes the new copy is never the one that deletes the old.

  The guard living in the store rather than in localStorage is what makes this
  safe: if the database is ever wiped, the guard goes with it, the migration runs
  again and finds the keys still there, so the grace period restarts instead of
  the work being gone. The check for it puts the keys back and empties the store,
  to prove it is the guard doing the work and not the keys being absent.

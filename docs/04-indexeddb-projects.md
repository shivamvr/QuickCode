# 04 — IndexedDB and multiple projects

**Size:** L · **Depends on:** 01 · **Status:** not started

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

# 02 — File System Access

**Size:** M · **Depends on:** 01 · **Status:** not started

## Why

Today every save is a **download**. `saveFile()` builds a Blob and hands it to
`saveAs()` ([scripts/index.js:186](../scripts/index.js#L186)), so editing a real
file means: open it, edit, download a copy to `Downloads`, then move it over the
original by hand. Round-tripping a project means exporting a zip and importing it
back ([`openProject`](../scripts/index.js#L203)).

The File System Access API removes all of that: open the actual file, Ctrl+S
writes back to it. For an editor this is the single largest daily-friction win
available.

## What changes

- `scripts/index.js` — `openFile`, `saveFile`, `showOverlay`, and the
  `#file` input handler in `wireToolbar()`.
- A new concept: the **current file handle** per pane, alongside the existing
  `fileName`.

## Approach

Keep a handle per tab id, next to the `TABS` table:

```js
// null until the pane is backed by a real file on disk
const fileHandles = { main: null, css: null, js: null }
```

**Open** — replace the hidden `<input type="file">` path when the API exists:

```js
const openWithPicker = async () => {
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: 'Code', accept: { 'text/*': ['.html', '.css', '.js', '.json', '.txt'] } }]
  })
  const file = await handle.getFile()
  fileHandles[quickEdit.tab] = handle
  setPaneText(quickEdit.tab, await file.text())
  fileName = file.name
  if (quickEdit.tab === 'main') setLang(fileExt[getExtension(file.name)])
}
```

**Save** — write back when a handle exists, otherwise fall back to today's
download:

```js
async function saveFile() {
  flushStorage()
  const id = quickEdit.tab
  const text = contentOf(id)
  let handle = fileHandles[id]
  if (!handle && window.showSaveFilePicker) {
    handle = await window.showSaveFilePicker({ suggestedName: suggestedFileName() })
    fileHandles[id] = handle
  }
  if (handle) {
    const w = await handle.createWritable()
    await w.write(text)
    await w.close()
    markSaved(id)            // clear the dirty marker
    return
  }
  saveAs(new Blob([text], { type: 'text/plain;charset=utf-8' }), suggestedFileName())
}
```

**Keep the fallback.** The API is Chromium-only; Firefox and Safari still need
the download path. Feature-detect with `'showOpenFilePicker' in window` and keep
the existing `<input type="file">` as the other branch. Both must work.

**Rebind Ctrl+S.** It currently opens the filename overlay
([scripts/index.js:~500](../scripts/index.js)). Once a handle exists, Ctrl+S
should save silently to it; the overlay becomes "Save as". Remember to
`preventDefault()` — that is already done.

**Directory handles** are the natural follow-on: `showDirectoryPicker()` plus
reading `index.html`/`style.css`/`index.js` out of a folder replaces zip
import/export with something far better. Worth doing as a second pass, not in
the first commit.

## Permissions

Handles do not survive a reload for free. To reopen the last file silently you
must persist the handle in **IndexedDB** (handles are structured-cloneable, so
they store directly) and then re-request permission:

```js
if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
  if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return
}
```

`requestPermission` needs a user gesture, so trigger it from a click, not on
load. This is the main reason item 04 (IndexedDB) pairs well with this one.

## Verification

- With the API available: open a file, edit, Ctrl+S, and confirm on disk that
  the original file changed and no copy landed in `Downloads`.
- With the API stubbed out (`delete window.showOpenFilePicker`): the old
  input-and-download path still works end to end.
- Cancelling the picker throws `AbortError` — confirm it is swallowed and the
  editor is left untouched, not left in a half-open state.
- The `#file` input still clears its value so the same file can be picked twice
  (a bug fixed earlier — do not regress it).

## Risks

- **Chromium only.** Two code paths must be maintained. Keep the fallback
  honest by testing it, not just assuming it.
- Every picker call must be inside a user gesture, so none of this can happen
  during startup.
- `createWritable()` truncates by default; on a crash mid-write the file can be
  left empty. Acceptable for an editor, but do not use it for the project store.

## Done when

Opening a file and pressing Ctrl+S modifies that file in place on a supporting
browser, the download path still works where the API is absent, and cancelling a
picker is a no-op.

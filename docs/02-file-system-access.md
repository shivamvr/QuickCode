# 02 — File System Access

**Size:** M · **Depends on:** 01 · **Status:** done (see Outcome)

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

## Outcome

**Done, September 2026.** A pane can be backed by a real file, and Ctrl+S writes
back to it in place.

What was built, against the plan above:

- `fileHandles = { main, css, js }` and `unsaved = { main, css, js }` in
  `scripts/index.js`, so each tab has its own file independently of the others.
- **Open** goes through `showOpenFilePicker()` where it exists. The toolbar
  control is still `<label for="file">`, so the handler calls `preventDefault()`
  to stop the label activating the hidden input as well - without it one click
  opens two dialogs. A picked `.zip` is still routed to `openProject()` and
  deliberately leaves the pane with no handle: a project import has no single
  file to write back to.
- **Ctrl+S** is `quickSave()`: write to the handle if the pane has one, otherwise
  fall through to the Save-as overlay. So a browser with no API, or a pane with
  no file yet, behaves exactly as it did before.
- **Ctrl+Shift+S** stays Save as. The overlay's name now feeds
  `showSaveFilePicker({ suggestedName })` where available, and the handle it
  returns is kept, so the next Ctrl+S goes straight to that file.
- **The toolbar icon still opens the overlay**, and the overlay's own save button
  is `saveFromOverlay()`: it writes back to the open file while the name is
  unchanged, and becomes a Save as as soon as the name is edited. The icon was
  briefly wired to save silently, which was wrong - `export project` lives
  *inside* that overlay, so a mouse user would have lost the only way to reach
  it. This way every path works without the keyboard and nothing moved in the
  toolbar.
- `ensureWritable()` does the `queryPermission` / `requestPermission` dance
  before the first write, and a refusal returns without touching anything.
- Cancelling any picker rejects with `AbortError`, which is swallowed as a no-op
  everywhere.

### Two decisions worth knowing about

**The unsaved marker lives in the tab title.** `document.title` becomes
`page.html - QuickCode`, with a leading `●` while the buffer has moved on from
the file. That needed no new markup and no CSS, which matters here: the toolbar
is deliberately left alone (see
[14-emmet-and-theming.md](14-emmet-and-theming.md)), and a dirty dot on the tab
strip would have meant new elements and new colours in it.

**Handles were session-only.** ~~Persisting them needs IndexedDB, which is item
04~~ - **item 04 did it.** A handle is stored per project and pane in the
`handles` store and restored at boot, so a reopened project still knows which
file each pane came from. The permission to write is deliberately not restored
with it: `requestPermission` only works inside a user gesture, and the next
Ctrl+S is one.

### Not done

**Directory handles.** `showDirectoryPicker()` reading a whole folder is the
natural replacement for zip import/export, and the plan already called it a
second pass. Item 04 is the better place for it, since a folder is really a
project.

### Verification

Eight checks in the `core` case of `node test/run.js`, all passing (44 total):

- a picked file lands in the pane, is attached to it, and the title names it
- Ctrl+S writes back to the handle and nothing is downloaded
- a refused write permission leaves the file untouched
- the save dialog writes to the open file with the name unchanged, opens no
  picker, downloads nothing, and still shows `export project`
- changing the name in the dialog does a save as, and the pane follows the new
  file
- cancelling either picker changes nothing and logs nothing
- with the API deleted, the hidden input still opens a file and still clears its
  value so the same file can be picked twice
- with the API deleted, saving downloads under the typed name

A real picker cannot be driven from a test - it needs a user gesture and shows a
native dialog - so the API is stubbed with a handle that records its writes; see
[test/README.md](../test/README.md). That covers every branch the app owns, but
it does not prove the browser's own write reaches the disk. **Not yet confirmed
by hand:** open a file in Chrome, edit it, press Ctrl+S, grant the permission
prompt once, and check the original file changed with nothing new in
`Downloads`.

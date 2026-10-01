# QuickCode test suite

```
node test/run.js
```

No dependencies, no install step. Exits `0` if everything passed, `1` if any
check failed, `2` if it could not run at all (no browser found).

Set `CHROME=/path/to/chrome` to override browser discovery, and `PORT` to move
off 8399.

`CASES=core` runs one scenario instead of all six, which is what mutation
testing wants: proving a single check bites should not cost six browser
launches. Names come from the table below, comma-separated, and an unknown one
is an error rather than a silent no-op. Run the whole suite before committing.

## What it does

`run.js` starts a static server over the repo, then drives headless Chrome
through six scenarios, each of which posts a pass/fail report back.

| Scenario | Page | Checks |
|---|---|---|
| `core` | `index.html` | fresh-load health, editor actions, key constants, lazy editors, write batching, every theme resolving, language/tab switching, project export, split resizing, prettier formatting, theme-failure handling, both file-open/save paths, the project store, share links, the preview console, version history, the diff view, TypeScript, and npm imports |
| `persist` | `index.html` | sets theme, tab, split, nav and all three files, reloads itself, then verifies everything came back |
| `migrate` | `index.html` | loads over a seeded pre-IndexedDB `localStorage`, then reloads: the migration must take everything, keep the old keys on that first load, clear them on the second, and not run twice |
| `share` | `index.html#s=…` | opens a share link that **node's zlib** built, not the browser |
| `preview-safe` | `app.html` | a hostile snippet runs in the preview and cannot reach the saved work |
| `offline` | `index.html` | waits for the service worker, tells the server to stop answering, reloads, and checks the whole app came out of the cache - TypeScript compiling included, since that is the reason no transpiler was added |

`serve.js` injects `seed.js` and `probe.js` into `index.html` / `app.html` as
they are served, so the suite always runs against **the real files in the repo**
rather than a copy that can drift.

The server resolves paths **case sensitively even on Windows**, because a theme
referenced as `ayudark` when the file is `AyuDark.json` used to work locally and
404 on GitHub Pages.

## Adding a check

Most checks belong in the `core` case. Add to `probe.js`:

```js
check('short description of the expectation', function () {
  return ok(someCondition, 'detail shown under the result')
})
```

If a case needs particular storage state first, arrange it in `seed.js` — it
runs in `<head>`, before any app script.

## Things this suite learned the hard way

Worth reading before adding assertions, because each of these produced a test
that looked correct and proved nothing:

- **Assert against the in-memory `quickEdit`, not `localStorage`.** Content
  writes are batched behind `writeSoon()`, so reading storage directly reports
  stale values and fails for the wrong reason. Use `readStored()` for content.
- **A test that passes because nothing ran is not a pass.** The preview
  isolation check originally "passed" while a syntax error meant no snippet
  executed at all. It now requires the snippet to report in via `postMessage`
  *and* the storage to be intact.
- **`KeyMod.Alt | undefined` is `512`, not `NaN`.** Bitwise OR coerces
  `undefined` to `0`, so a renamed monaco key constant yields a valid-looking
  number bound to the wrong key. Check that the constant *names* resolve.
- **`editor.getSupportedActions()` does not list actions added via
  `addAction()`.** Use `editor.getAction(id)`.
- **Killing Chrome discards localStorage** before it reaches disk, so state
  cannot be handed between two browser processes. The `persist` case reloads the
  page within one session instead.
- **Monaco's own DOM is full of `aria-*` and `tabindex`.** Any DOM-counting
  assertion must exclude `.monaco-editor` subtrees.
- **`</body>` appears inside a JavaScript string in `app.html`.** Injection has
  to target the *last* occurrence, or it silently corrupts `buildDoc()`.
- **A file picker cannot be driven from a test.** `showOpenFilePicker` and
  `showSaveFilePicker` are stubbed with a fake handle that records what was
  written, which still covers everything the app owns: which path a click takes,
  the write-permission check, the unsaved marker, and the fallback when the API
  is absent. A real `<input type="file">` click would open a chooser and hang the
  run, so the probe cancels that click after counting it.
- **`ResizeObserver loop completed with undelivered notifications` is not an app
  error.** Monaco observes its own container, so any layout change can raise it,
  unpredictably. `serve.js` filters it out, or every no-errors assertion would be
  flaky.
- **A synchronous `XMLHttpRequest` is not handed to the service worker.** It goes
  to the network regardless, so in the `offline` case it fails no matter how
  complete the cache is. Anything checking the cache has to use `fetch()`.
- **A `<link disabled>` stylesheet is never loaded by Chrome**, so
  `verticalNav.css` is absent from `document.styleSheets` until something enables
  it. Counting stylesheets and expecting three is wrong.
- **What the cache must hold cannot be hardcoded.** The expected list is derived
  from the live DOM, which is what caught monaco's lazily-injected language
  modules - they are in no source file, and are needed offline.
- **A stand-in for a `FileSystemFileHandle` has to be cloneable.** Handles go
  into IndexedDB through structured clone, and an object carrying its own
  methods cannot be cloned. The fake keeps its methods on a prototype so its own
  properties are all data; one check uses a real handle from the origin private
  file system, because the fake proves nothing about clone.
- **A queued flush will undo a delete.** Anything emptying the store from a test
  has to `cancelFlush()` and drop the in-memory record first, or the write lands
  mid-delete and puts the project straight back. The app does the same thing in
  `removeProject()`, for the same reason.
- **Driving a completion provider by hand is not what monaco does.** Emmet
  reads monaco's tokens, and monaco tokenizes lazily, so a provider called in
  the same turn as `setValue` gets nothing - or throws from inside emmet. The
  check polls instead. It also asks *every* provider registered for the
  language: monaco registers its own html completions when that mode loads, so
  picking the first one sometimes asked the wrong library. And registering a
  second copy of emmet to spy on it tore down state the live one was using;
  `serve.js` records the real registrations instead.
- **The browser does not always tell you a thing failed.** A module whose import
  404s reports nothing at all: no error event, no rejection, nothing after twelve
  seconds. Anything that depends on hearing about a failure needs proof the
  failure is audible before it is designed around - here it was not, and the
  check had to move to the parent window, which can see it.
- **Finding the text is not the same as finding the bug.** The first check for a
  specifier breaking out of the import map looked for the hostile tag's text
  anywhere in the document. It is there, inert, inside the map - which is the
  point of escaping it. The check now compares positions: where the map tag ends
  versus where the payload sits.
- **Look the error code up, do not infer it.** "Cannot find module" is 2792 when
  it suggests `moduleResolution`, and 2307 when it does not. Guessing 2307 cost a
  run. Likewise `diagnosticCodesToIgnore` suppresses the editor's underlines but
  not what the worker reports to a direct caller - two layers, two filters.
- **A mutation can find a gap in the tests rather than a bug in the code.**
  Dropping the sign bit from the source map's VLQ decoder passed all 150 checks:
  compiled code only ever walks forwards through its source, so no fixture ever
  reached a negative delta. The fix was not to the decoder but to the suite -
  the decoder is now called directly with a mappings string that goes backwards.
  A mutation that survives is a question about the checks, not a clean bill.
- **A mutation that does not apply looks exactly like a check that does not
  bite.** The first attempt at mutating the diff view matched on `\n` against
  CRLF files, changed nothing, and reported a clean run - which read as "the
  leak check is useless". The script that applies these now refuses to continue
  unless the bytes actually changed.
- **Calling the function is not clicking the thing.** The first draft of the
  diff checks called `openDiff()` directly, so neutering the click handler
  passed every one of them - while a real click on the compare glyph fell
  through to the row and *restored*, overwriting the work. Drive the DOM for
  anything whose failure mode is "it did the other thing".
- **Monaco reports adjacent edits as a single change.** A fixture with an edit,
  a deletion and an addition on consecutive lines counts as one change, not
  three. Space them out with unchanged lines between.
- **Ask a library how it actually works before testing it.** Emmet looks like
  "type an abbreviation, press Tab", so the check simulated a Tab and found
  nothing expanded. It is a **completion provider**; Tab is the suggest widget
  accepting its item. The check asks the provider directly now.
- **Running an action does not prove its key is bound.** That is the whole
  failure mode of a monaco upgrade - `KeyMod.Alt | undefined` is `512`, a
  perfectly valid binding on the wrong key. The suite sends real keyboard events
  and watches the model change.
- **Test the invariant, not the description of it.** The preview's line numbers
  depend on nothing injected above the user's code carrying a newline. A check
  that exercised only the mapping passed happily while a newline was being
  injected; the check that compares the built document against the source caught
  it at once.
- **Two overlapping async reads can finish in either order.** A one-in-four
  flake in the preview case turned out to be `app.html` painting a stale read
  over a fresh one - a real bug, not a test problem. Timings are printed per
  case now, and the giveaway was that case sitting at 15s where it should take
  under one.
- **A round trip against yourself proves nothing about a format.** The share
  link case builds its link in node with `zlib.deflateRawSync` and hands it to
  the browser, so encode and decode are different implementations. Encoding and
  decoding with the same code would pass just as happily on a private format.
- **Budget for the slowest machine, not this one.** Several intermittent
  failures turned out to be timing. The offline case cannot start until the
  service worker has precached about 2.5MB from two CDNs, and that case has been
  measured at anywhere from 3 to 29 seconds depending on the day; it waits 60s
  now. `probe.js` runs a 90s watchdog so a hang reports what it had checked and
  where it stopped, instead of leaving the runner to say only "timed out" - that
  watchdog is what identified this one, by naming the case and the phase.
  `TRACE=1 node test/run.js` logs every request and its timing, for when a page
  stops asking for things entirely.
- **Two reports from one scenario is one too many.** The runner takes the first
  report as final, so a case that reloads hands its results to the next phase
  through `sessionStorage` rather than sending them twice.

## Verifying the suite still bites

A test suite that cannot fail is worthless. Both of these should turn red:

```sh
# 1. the case-sensitivity bug
mv themes/Dracula.json themes/dracula.json && node test/run.js   # expect FAIL
# 2. the monaco rename bug
#    change monaco.KeyCode.KEY_Z to KeyZ in scripts/eventListener.js
node test/run.js                                                  # expect FAIL
# 3. the save-in-place path
#    drop the e.preventDefault() from the open-label handler, or make quickSave
#    treat every pane as having no handle, in scripts/index.js
node test/run.js                                                  # expect 4 FAILs
# 4. the offline cache
#    delete one theme from SHELL in sw.js, return the data: worker url in
#    index.html, or make networkFirst return a 5xx instead of falling back
node test/run.js                              # expect 3 FAILs + the offline case
# 5. the project store
#    drop the pane re-sync from applyProject(), the migration guard from
#    migrate(), or the body of snapshot() in scripts/store.js
node test/run.js                                       # expect 3, 1 and 1 FAILs
# 6. share links
#    make importShared() write over the open project, drop the version check in
#    decodeShare(), or remove the history.replaceState that clears the fragment
node test/run.js                                       # expect 2, 1 and 2 FAILs
# 7. the preview console
#    inject a newline above the user's code in scripts/preview.js, or drop the
#    e.source check from the message handler in scripts/index.js
node test/run.js                                          # expect 1 FAIL each
# 8. the monaco upgrade
#    put back one old KeyCode name (KeyD -> KEY_D) in eventListener.js, misspell
#    an option in editorOptions(), or make settheme() always set vs-dark
node test/run.js                                       # expect 3, 1 and 1 FAILs
# 9. version history
#    drop the dedup or the thinning from scripts/store.js, or the pre-restore
#    snapshot or the snapshot cleanup from scripts/index.js
CASES=core node test/run.js                               # expect 1 FAIL each
# 10. the diff view, in scripts/diff.js unless said otherwise
#     drop dropDiffModels() from teardownDiff, or put the borrowed live model
#     into diffModels so it gets disposed too, or drop teardownDiff() from
#     splitMenu() in eventListener.js, or drop the showSplitPane that hands the
#     pane back, or drop closeDiffIfGone from removeSnapshot in index.js, or
#     look for the row before the compare glyph in the history click handler,
#     or point the bar's restore at an element that does not exist
CASES=core node test/run.js                          # expect 1-2 FAILs each
# 11. typescript, in scripts/typescript.js unless said otherwise
#     drop the plain-javascript short circuit from jsForPreview, or the source
#     map step from logToConsole in index.js, or the sign bit from decodeVlq, or
#     make a syntax error non-fatal, or have settingsOf in store.js skip the
#     defaults, or let the badge's click reach the tab in index.js, or drop
#     applyJsLang from applyProject, or publish nothing for the popped out
#     preview
CASES=core node test/run.js                               # expect 1 FAIL each
# 12. npm imports, in scripts/imports.js unless said otherwise
#     stop skipping line comments in blankOut, drop the isAddressSpecifier
#     filter, make scriptOpenFor in preview.js always or never return a module,
#     make importMapTag emit nothing, drop its safeInline, drop the
#     trailing-slash entries, drop reportImportProblems from index.js, treat
#     every slash as division, or drop 2792 from IGNORED_DIAGNOSTICS in
#     typescript.js
CASES=core node test/run.js                             # expect 1-4 FAILs each
```

All twelve were confirmed to fail when introduced, and pass once reverted.

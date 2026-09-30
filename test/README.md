# QuickCode test suite

```
node test/run.js
```

No dependencies, no install step. Exits `0` if everything passed, `1` if any
check failed, `2` if it could not run at all (no browser found).

Set `CHROME=/path/to/chrome` to override browser discovery, and `PORT` to move
off 8399.

## What it does

`run.js` starts a static server over the repo, then drives headless Chrome
through three scenarios, each of which posts a pass/fail report back.

| Scenario | Page | Checks |
|---|---|---|
| `core` | `index.html` | fresh-load health, editor actions, key constants, lazy editors, write batching, every theme resolving, language/tab switching, project export, split resizing, prettier formatting, theme-failure handling, and both file-open/save paths |
| `persist` | `index.html` | sets theme, tab, split, nav and all three files, reloads itself, then verifies everything came back |
| `preview-safe` | `app.html` | a hostile snippet runs in the preview and cannot reach the saved work |

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
```

All three were confirmed to fail when introduced, and pass once reverted.

# 09 — Upgrade monaco

**Size:** M · **Depends on:** 15 (tests first) · **Status:** done (see Outcome)

## Why

The editor is pinned to **0.25.1**, released mid-2021 ([index.html](../index.html)).
Four years of fixes are on the table, plus features that matter for this kind of
tool: sticky scroll, native bracket-pair colorization, inlay hints, a much better
diff editor (which item 13 wants), and improved touch handling.

## The breaking change to plan around

Monaco renamed its `KeyCode` constants around 0.30. All eight custom keybindings
in [`addAction()`](../scripts/eventListener.js#L147) use the old names:

| Current (0.25) | New |
|---|---|
| `KeyCode.KEY_Z` | `KeyCode.KeyZ` |
| `KeyCode.KEY_D` | `KeyCode.KeyD` |
| `KeyCode.KEY_Q` | `KeyCode.KeyQ` |
| `KeyCode.KEY_L` | `KeyCode.KeyL` |
| `KeyCode.KEY_0` | `KeyCode.Digit0` |
| `KeyCode.US_MINUS` | `KeyCode.Minus` |
| `KeyCode.US_EQUAL` | `KeyCode.Equal` |

These fail in the worst possible way, and more subtly than it first appears.
An undefined constant does **not** produce `NaN`: `KeyMod.Alt | undefined`
coerces to `512`, a perfectly valid number. So the action registers happily with
a modifier-only binding, the context-menu entry still works, and the shortcut is
silently bound to the wrong thing. Nothing throws and nothing looks broken.

The suite from item 15 checks that every `monaco.KeyCode.*` and `monaco.KeyMod.*`
name used in `eventListener.js` resolves to a number in the loaded build, which
is what actually catches this. (Asserting the arithmetic is not `NaN` does not —
that was tried and passed while the binding was broken.)

## Also check

- **The worker bootstrap.** The `MonacoEnvironment.getWorkerUrl` data: URL in
  [index.html](../index.html) hardcodes `MONACO_BASE` and
  `vs/base/worker/workerMain.js`. That path has been stable, but verify a real
  `Worker` is still constructed after the bump.
- **The theme JSON format.** All 19 files in `themes/` are fed to
  `monaco.editor.defineTheme` ([settheme](../scripts/index.js#L297)). The
  `{ base, inherit, rules, colors }` shape is unchanged, but newer monaco
  validates more strictly, and a file that used to pass may throw. The `.catch`
  added earlier falls back to `vs-dark`, so a broken theme shows up only as "the
  theme silently didn't change".
- **`emmet-monaco-es`** is loaded unpinned from unpkg and reaches into monaco
  internals. It is the most likely thing to break. Pin a version while upgrading
  so it is not a second moving part.
- **Deprecated options.** Confirm `editorOptions()`
  ([scripts/index.js:93](../scripts/index.js#L93)) still has no unknown keys.
  Monaco ignores unknown options silently, which is how the original
  `lineNumber` / `glyphmargin` / `scrollBeyoundLastLine` typos survived for
  years.

## Approach

1. Land item 15 first.
2. Bump the CDN version. `MONACO_BASE` is already a single constant, so this is a
   one-line change.
3. Rename the seven `KeyCode` constants.
4. Run the suite, then check by hand: all 8 shortcuts, all 19 themes, emmet
   expansion, split-pane cursor sync.
5. Optionally adopt what is now available: `stickyScroll: { enabled: true }`,
   `bracketPairColorization: { enabled: true }`, bracket-pair guides.

## Verification

- Every one of the 8 actions resolves via `editor.getAction(id)` **and** its
  keybinding actually fires. Calling `getAction(...).run()` is not sufficient —
  it does not prove the key is bound, which is the whole risk here.
- A real `Worker` is constructed and diagnostics appear for a deliberate syntax
  error in the JS pane.
- All 19 theme files load and visibly change the editor; none falls back.
- Emmet: `div.a>ul>li*3` then Tab still expands in the HTML pane.
- Existing projects open unchanged.

## Risks

- **Silent keybinding loss**, as above.
- `emmet-monaco-es` breaking with no obvious error.
- A larger bundle; worth measuring against first paint now that loading goes
  through the AMD loader rather than blocking tags.
- Rollback is one constant, so this is safe to attempt and abandon.

## Done when

The suite passes on the new version, all 8 shortcuts fire from the keyboard, all
19 themes apply, and emmet still expands.

## Outcome

**Done, September 2026.** Monaco went from **0.25.1 (mid-2021) to 0.52.2**, and
`emmet-monaco-es` is pinned at 5.7.0.

### Why 0.52.2 and not the newest

cdnjs has 0.57.0. It is not usable here, and this is the main finding of the
item: **from 0.53 onwards monaco is a rollup rebuild with content-hashed
filenames** - `cssMode-eIUIN_ru.js`, `html-BTio3wpy.js` - and
`vs/base/worker/workerMain.js` no longer exists. Two things in this project
depend on that layout:

- the worker bootstrap in `index.html`, which builds a tiny worker that
  `importScripts` that exact path
- the service worker's vendor precache list, which has to name every file by
  hand because nothing can discover them

Hashed names would mean rewriting that list, with new hashes, on every upgrade.
0.52.2 is the last release with the classic layout, so it is the one to sit on
until there is a reason to take the rebuild on properly.

The one thing that did move even in 0.52.2: **`vs/editor/editor.main.nls.js` is
gone**. English is built in now and only translations ship as
`nls.messages.<lang>.js`, so that entry came out of the precache list.

### The renames, which were the whole risk

All seven, as the plan listed them: `KEY_Z` `KEY_D` `KEY_Q` `KEY_L` to `KeyZ`
`KeyD` `KeyQ` `KeyL`, `KEY_0` to `Digit0`, `US_MINUS` to `Minus`, `US_EQUAL` to
`Equal`.

The existing check that every named constant resolves caught these, as designed.
But the plan also said that was not enough - running an action does not prove
its key is bound - so there is now a check that **sends real keyboard events at
the editor**: Ctrl+D has to make a second line, Alt+Z has to flip word wrap.
Reverting one rename proves it works: the action still registers, the context
menu entry still appears, and the new check reports `ctrl+D made 1 lines (want
2)` while the old one says the constant is undefined. That is exactly the
failure this item existed to prevent.

### Two defaults that would have changed how the editor looks

`bracketPairColorization` and `stickyScroll` both arrived **on by default**.
Coloured brackets and a pinned scope header are real changes to an editor nobody
asked to change, and coloured brackets in particular would sit oddly against the
hardcoded `.mtk*` token colours in `tabs.css`. Both are explicitly **off** in
`editorOptions()`, so the editor looks exactly as it did; each is one word to
turn on and both are worth trying.

### What else was checked

- **Unknown options.** `lineNumber`, `glyphmargin` and `scrollBeyoundLastLine`
  were all misspelled once and monaco said nothing for years, because it ignores
  options it does not recognise. Every key `editorOptions()` passes is now
  checked against `monaco.editor.EditorOption`.
- **Every theme.** Not just that the files load - each of the 13 is applied and
  the editor's computed background is compared against the `editor.background`
  in its own JSON. All 13 take. Making `settheme` fall back on purpose names all
  13 with their expected colours, so the check is not vacuous.
- **Emmet, and a correction.** The plan and the old test both described emmet as
  "type an abbreviation and press Tab". That is what a user sees, but it is not
  how the library works: **emmet-monaco-es registers a completion provider**, and
  Tab is the suggest widget accepting its item. A synthetic Tab therefore expands
  nothing, which looked like a break and was not. The check now asks the provider
  directly - `div.a>ul>li*3` and `m10` both expand - which also exercises the
  monaco model APIs the library reaches into, and those are what an upgrade
  breaks.

### Verification

`node test/run.js` - **110 checks**, all passing, five of them new: real
keyboard dispatch, option-name validation, every theme applying visibly, emmet
through its provider, and the two appearance defaults staying off.

The `core` case also got **faster**, 11.5s to about 7.5s, despite the larger
bundle (editor.main.js is 735KB against 509KB).

### Now unblocked

Item 13 (diff view) wanted a newer monaco for its diff editor, and item 10
(TypeScript, JSX) wanted the newer TypeScript that ships inside it.

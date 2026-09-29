# 09 — Upgrade monaco

**Size:** M · **Depends on:** 15 (tests first) · **Status:** not started

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

These fail in the worst possible way: the old name is `undefined`,
`KeyMod.Alt | undefined` is `NaN`, and the action registers with a garbage
keybinding. The context-menu entries keep working, so it is easy to believe the
upgrade succeeded while every shortcut is quietly dead. This is exactly the class
of bug a smoke test catches and eyeballing does not — hence the dependency on
item 15.

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

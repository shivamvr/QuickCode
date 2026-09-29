# 13 — Diff view

**Size:** S · **Depends on:** 09, 12 · **Status:** not started

## Why

Monaco ships a diff editor. Once snapshots exist (item 12), "what changed since
this morning" is a few lines of wiring rather than a feature. It is also the
honest way to decide whether to restore a snapshot instead of guessing from a
timestamp.

Useful beyond history: diff the current pane against a file on disk (item 02), or
against a shared link someone sent you.

## Approach

`monaco.editor.createDiffEditor` takes two models rather than a value:

```js
const diff = monaco.editor.createDiffEditor(gets('#diffContainer'), {
  automaticLayout: true,
  readOnly: true,
  renderSideBySide: true,
  ...editorOptions('', 'html'),   // reuse the shared options for consistency
})

diff.setModel({
  original: monaco.editor.createModel(snapshot.code, 'html'),
  modified: monaco.editor.createModel(contentOf('main'), 'html'),
})
```

Two things specific to this codebase:

- **Dispose the models.** `createModel` leaks if not disposed, and opening the
  diff repeatedly would accumulate them. Dispose both when the view closes, and
  dispose the diff editor itself. Nothing else in the project creates throwaway
  models, so this is a new discipline to get right.
- **Where it lives.** The simplest home is the split pane: reuse
  `#splitContainer` and swap its contents, so the existing show/hide plumbing in
  `doSplit()` / `singleEditor()` applies. The alternative is an overlay like the
  save dialog. Prefer the split pane — the layout already works and item 07 makes
  it resizable.

Newer monaco (item 09) has a much better diff experience than 0.25 — moved-code
detection and inline view — which is why this depends on the upgrade.

## Verification

- Diff a snapshot against current: additions, deletions and modifications all
  render correctly.
- Diff two identical texts: shows no changes rather than a broken view.
- Open and close the diff ten times; confirm no model or editor accumulation
  (check `monaco.editor.getModels().length` returns to its baseline).
- The diff respects the active theme.
- Closing the diff restores the previous split-pane content and language.

## Risks

Low, with one real trap: model leaks. Everything else in this project holds a
model for the lifetime of the page, so the dispose path is genuinely new code and
easy to forget.

## Done when

A snapshot can be compared against current in a side-by-side view, closing it
leaves no models behind, and the split pane returns to its prior state.

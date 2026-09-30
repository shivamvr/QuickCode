# 13 — Diff view

**Size:** S · **Depends on:** 09, 12 · **Status:** done (see Outcome)

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

## Outcome

**Done, September 2026.** The **⇄** on a history row puts that snapshot beside
what is open, which is what makes restoring a decision rather than a guess at a
timestamp.

### What was built

- **`scripts/diff.js`**, in the split pane as the plan preferred: the layout,
  the drag handle, the narrow-screen stacking and the theme all came for free.
  A bar across the top names the snapshot, offers html / css / js, and carries
  `restore` and `close`.
- **`restore` from the bar.** Decide, then act, without going back to a list of
  times. It confirms and is undoable, exactly as restoring from the menu is, and
  the view is rebuilt afterwards so it shows nothing left to change.
- **Three files, not one.** A diff editor takes one pair of models, so the bar
  switches which file is being compared.

### The model discipline

The plan called model leaks the one real trap, and it was right to. Two rules
came out of it:

- **The snapshot side is created here and disposed here** - `diffModels` is the
  list, and it is the only thing that gets disposed.
- **The live side is the pane's own model, borrowed.** That is what makes the
  diff follow your typing as you work, rather than being a still of the moment
  it opened. It also means disposing it would take the editor with it, so it is
  deliberately kept out of `diffModels`, and `setModel(null)` runs before the
  editor is disposed so nothing internal can reach for it. The test that proves
  this mutates it: disposing the live side empties the css pane outright.

A new pair replaces the old one **before** the old one is disposed, so there is
no moment where the editor holds a disposed model.

### Where this differs from the plan

The plan only said "swap the contents of `#splitContainer`". Doing that turned
up a real bug in what was already there: `showPreviewPane(boolean)` decided
between two things, and a third made the boolean wrong - the diff hid both, and
closing it left the pane empty until something else happened to set it. There is
now one `showSplitPane('editor' | 'preview' | 'diff')` that owns the question,
and closing the diff always hands the pane back before deciding whether the
split itself stays open.

### Verification

`node test/run.js` - **138 checks**, all passing. Fourteen are new: the diff
being the snapshot against what is open, an edit, a deletion and an addition
each reported as such, both of them drawn, neither side editable, the active
theme, an unchanged file reading as unchanged rather than broken, the compared
pane surviving the close, the split pane coming back as it was, a diff opened
from a single editor putting the single editor back, ten rounds leaving no
models behind, a split tab closing the diff rather than hiding behind it, the
⇄ comparing instead of restoring, `restore` from the bar, and a deleted
snapshot closing the comparison.

Mutation-checked, seven of them, all caught: dropping the dispose, disposing the
borrowed live model, letting a split tab be picked with the diff still holding
the pane, closing without handing the pane back, leaving a deleted snapshot on
screen, looking for the row before the ⇄ inside it, and unwiring `restore`.

Two of those are worth naming. **Looking for the row first makes ⇄ restore
instead of compare** - the same shape as the delete cross in item 12, and the
check for it only existed after a mutation walked straight past the first draft
of these tests, which called `openDiff()` directly and never clicked anything.
And **monaco reports adjacent edits as one change**, so the fixture spaces the
three kinds out with unchanged lines between them; the first version put them
next to each other and counted one change where it wanted three.

//---------------------------------------------------------------------
// Comparing a snapshot against what is open. It borrows the split pane, so
// the layout, the resize handle, the narrow-screen stacking and the theme
// all come for free.
//
// This is the only place in the project that makes a model it has to throw
// away again - everywhere else a model lives as long as the page does. So
// there is one rule here, and diffModels is it: whatever this view created,
// this view disposes. The modified side is deliberately not in that list.
//---------------------------------------------------------------------

let diffEditor = null
let diffModels = []          // only what this view created
let diffRow = null           // the snapshot being looked at
let diffFile = 'main'
let diffHadSplit = false     // was the split open before the diff borrowed it

const diffShowing = () => diffEditor !== null

// The three files, in tab order. The labels match the split tabs above.
const DIFF_FILES = [
  { id: 'main', label: 'html' },
  { id: 'css', label: 'css' },
  { id: 'js', label: 'js' },
]

const dropDiffModels = () => {
  diffModels.forEach((m) => { if (m && !m.isDisposed()) m.dispose() })
  diffModels = []
}

// Shared options plus the diff-specific ones. value and language go: a diff
// editor is given two models instead of one string.
function diffOptions() {
  const options = editorOptions('', 'html')
  delete options.value
  delete options.language
  return Object.assign(options, {
    // A view of the past. Editing either side would have nowhere to put it.
    readOnly: true,
    originalEditable: false,
    // Side by side when there is room; monaco drops to the inline view on its
    // own when there is not, which is most of the time in half a split pane.
    renderSideBySide: true,
    // Two minimaps in half a screen is noise.
    minimap: { enabled: false },
    // Reindenting a block should not read as every line having changed.
    ignoreTrimWhitespace: false,
    // 0.52 can tell a moved block from a deleted one plus an added one.
    experimental: { showMoves: true },
  })
}

function ensureDiffEditor() {
  if (!diffEditor) {
    const host = gets('#diffBody')
    host.innerHTML = ''
    diffEditor = monaco.editor.createDiffEditor(host, diffOptions())
  }
  return diffEditor
}

// Puts one of the three files in the view. The snapshot side is built here and
// owned here; the modified side is the pane's own live model, which is why
// typing shows up in the diff as you type - and why it must never be disposed.
function showDiffFile(id) {
  if (!diffRow || !TABS[id]) return
  diffFile = id
  const editorFor = ensureDiffEditor()
  const lang = TABS[id].lang
  const original = monaco.editor.createModel(diffRow[TABS[id].key] || '', lang)
  const live = TABS[id].ensure()

  // Hand the new pair over before disposing the old one: for the moment in
  // between, the editor would otherwise be holding a disposed model.
  const previous = diffModels
  diffModels = [original]
  editorFor.setModel({ original: original, modified: live.getModel() })
  previous.forEach((m) => { if (m && !m.isDisposed()) m.dispose() })

  getsAll('.diffFile').forEach((el) => {
    el.classList.toggle('active-tab', el.getAttribute('data-diff-file') === id)
  })
  const label = gets('#diffTitle')
  if (label) label.textContent = historyLabel(diffRow) + '  \u2192  now'
}

// Lets go of everything and hands the pane back to whatever it was showing
// before. It does not decide whether the split itself stays open: closeDiff
// does that, and splitMenu is about to decide for itself.
function teardownDiff() {
  if (!diffShowing()) return
  // Let go of the models first. The live one belongs to a pane, and whatever
  // dispose() does internally, it must not be handed that.
  diffEditor.setModel(null)
  diffEditor.dispose()
  diffEditor = null
  dropDiffModels()
  diffRow = null
  // Whether or not the split stays open, the pane goes back to showing what it
  // was showing. Left hidden, the next doSplit() would open onto nothing.
  showSplitPane(splitPaneDefault())
}

// Puts the split pane back exactly as the diff found it, closed included.
function closeDiff() {
  if (!diffShowing()) return
  const hadSplit = diffHadSplit
  teardownDiff()
  if (!hadSplit) singleEditor()
}

// A snapshot that has been deleted must not stay on screen as though it were
// still there to restore.
function closeDiffIfGone(ids) {
  if (diffRow && ids.indexOf(diffRow.id) > -1) closeDiff()
}

async function openDiff(id) {
  const row = await getSnapshot(id)
  if (!row) return
  diffRow = row
  if (!diffShowing()) diffHadSplit = !!quickEdit.split
  // the diff needs the pane, so open the split if it was not already
  if (!quickEdit.split) doSplit()
  showSplitPane('diff')
  ensureDiffEditor()
  showDiffFile(TABS[diffFile] ? diffFile : 'main')
}

function wireDiff() {
  const pane = gets('#diffPane')
  if (!pane) return
  getsAll('.diffFile').forEach((el) => {
    onClick(el, () => showDiffFile(el.getAttribute('data-diff-file')))
  })
  onClick(gets('#diffClose'), closeDiff)
  onClick(gets('#diffRestore'), () => {
    const id = diffRow && diffRow.id
    if (!id) return
    // Deciding whether to restore is what the comparison was for. It asks
    // first, as it does from the menu, and the view is rebuilt afterwards so
    // it shows the truth rather than the differences it used to have.
    restoreSnapshot(id)
      .then(() => { if (diffShowing()) showDiffFile(diffFile) })
      .catch((err) => console.error('Could not restore that', err))
  })
}

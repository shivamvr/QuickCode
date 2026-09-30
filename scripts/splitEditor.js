//---------------------------------------------------------------------
// The second pane of the split view, created the first time the split is
// opened. It shows whichever language quickEdit.splitLang names and writes
// back to that language's storage key.
//---------------------------------------------------------------------

let splitEditor = null

function ensureSplitEditor() {
  if (!splitEditor) {
    const lang = SPLIT_TABS[quickEdit.splitLang] ? quickEdit.splitLang : 'html'
    gets('#splitEditor').innerHTML = ''
    splitEditor = monaco.editor.create(gets('#splitEditor'),
      editorOptions(contentOf(SPLIT_TABS[lang]), langOf(SPLIT_TABS[lang])))
    splitEditor.getModel().onDidChangeContent(saveSplitEditor)
    splitEditor.onDidBlurEditorWidget(onSplitBlur)
    splitEditor.onDidFocusEditorWidget(onSplitFocus)
    addAction(splitEditor)
  }
  return splitEditor
}

// the split pane writes to the key of whatever language it is currently showing
function saveSplitEditor() {
  const id = SPLIT_TABS[quickEdit.splitLang]
  const spec = TABS[id]
  if (spec && splitEditor) {
    writeSoon(spec.key, splitEditor.getValue())
    // the split pane edits the same file as its tab, so it dirties it too
    markUnsaved(id)
  }
}

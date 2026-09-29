//---------------------------------------------------------------------
// The CSS pane. Built the first time the css tab is shown rather than at
// startup: four monaco instances up front cost four editor constructions and
// four resize observers, when at most two are ever visible.
//---------------------------------------------------------------------

let cssEditor = null

function ensureCssEditor() {
  if (!cssEditor) {
    gets('#cssEditor').innerHTML = ''
    cssEditor = monaco.editor.create(gets('#cssEditor'), editorOptions(readStored('css'), 'css'))
    cssEditor.getModel().onDidChangeContent(() => saveEditor('css'))
    cssEditor.onDidBlurEditorWidget(() => onEditorBlur('css'))
    cssEditor.onDidFocusEditorWidget(() => onEditorFocus('css'))
    addAction(cssEditor)
  }
  return cssEditor
}

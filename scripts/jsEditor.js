//---------------------------------------------------------------------
// The JS pane, created on first use. See cssEditor.js.
//---------------------------------------------------------------------

let jsEditor = null

function ensureJsEditor() {
  if (!jsEditor) {
    gets('#jsEditor').innerHTML = ''
    jsEditor = monaco.editor.create(gets('#jsEditor'), editorOptions(readStored('js'), 'javascript'))
    jsEditor.getModel().onDidChangeContent(() => saveEditor('js'))
    jsEditor.onDidBlurEditorWidget(() => onEditorBlur('js'))
    jsEditor.onDidFocusEditorWidget(() => onEditorFocus('js'))
    addAction(jsEditor)
  }
  return jsEditor
}

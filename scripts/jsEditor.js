//---------------------------------------------------------------------
// The JS pane, created on first use. See cssEditor.js.
//---------------------------------------------------------------------

let jsEditor = null

function ensureJsEditor() {
  if (!jsEditor) {
    gets('#jsEditor').innerHTML = ''
    // A model of its own, named .tsx - see JS_PANE_URI for why the extension
    // matters. value and language come from the model, so they go.
    const options = editorOptions(readStored('js'), langOf('js'))
    delete options.value
    delete options.language
    options.model = jsPaneModel(readStored('js'), langOf('js'))
    jsEditor = monaco.editor.create(gets('#jsEditor'), options)
    jsEditor.getModel().onDidChangeContent(() => saveEditor('js'))
    jsEditor.onDidBlurEditorWidget(() => onEditorBlur('js'))
    jsEditor.onDidFocusEditorWidget(() => onEditorFocus('js'))
    addAction(jsEditor)
  }
  return jsEditor
}

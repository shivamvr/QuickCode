
gets("#cssEditor").innerHTML = "";

let savedcss = localStorage.getItem("css");

var cssEditor = monaco.editor.create(document.getElementById("cssEditor"), editorOptions(savedcss, 'css'));

//---------------------Save-to-loacalstorage--------------------------
window.cssEditor.getModel().onDidChangeContent(() => {saveItLocal('css')});
let cssCheck = gets('#cssCheck')

if (quickEdit.css) {
  cssCheck.checked = true
}

cssCheck.addEventListener('change', () => {
  saveSettings({ css: gets('#cssCheck').checked })
})

gets("#jsEditor").innerHTML = "";

let savedjs = localStorage.getItem("js");


var jsEditor = monaco.editor.create(document.getElementById("jsEditor"), editorOptions(savedjs, 'javascript'));

//---------------------Save-to-loacalstorage--------------------------
window.jsEditor.getModel().onDidChangeContent(() => {
  saveItLocal('js')
});

let jsCheck = gets('#jsCheck')
if (quickEdit.js) {
  jsCheck.checked = true
}

jsCheck.addEventListener('change', () => {
  saveSettings({ js: gets('#jsCheck').checked })
})


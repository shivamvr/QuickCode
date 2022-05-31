
var jsContent = $.trim($("#jsEditor").text());
$("#jsEditor").html("");

let savedjs = localStorage.getItem("js");


var jsEditor = monaco.editor.create(document.getElementById("jsEditor"), {
  value: savedjs,
  language: 'javascript',
  lineNumber: "on",
  glyphmargin: false,
  vertical: "auto",
  horizontal: "auto",
  verticalScrollbarSize: 8,
  horizontalScrollbarSize: 8,
  scrollBeyoundLastLine: false,
  readOnly: false,
  automaticLayout: true,
  minimap: {
    enabled: true,
  },
  lineHeight: 30,
  scrollbar: {
    verticalScrollbarSize: 20,
    horizontalScrollbarSize: 17,
  },
});

//---------------------Save-to-loacalstorage--------------------------
let reload = false
localStorage.setItem("reload", reload);
window.jsEditor.getModel().onDidChangeContent(() => {saveItLocal('js')
  reload = true
  localStorage.setItem('reload',reload)
});

let jsCheck = gets('#jsCheck')
if (quickEdit.js) {
  jsCheck.checked = true
}

jsCheck.addEventListener('change', () => {
  let quickEdit = JSON.parse(localStorage.getItem("quickEdit"));
  let jsCheck = gets('#jsCheck')
  quickEdit.js = jsCheck.checked
  localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
  reload = true
  localStorage.setItem('reload',reload)
})


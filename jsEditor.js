
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
  verticalScrollbarSize: 10,
  horizontalScrollbarSize: 10,
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

window.jsEditor.getModel().onDidChangeContent(() => { saveItLocal('js') });

let jsCheck = gets('#jsCheck')

jsCheck.addEventListener('change',()=>{
  let quickEdit = JSON.parse(localStorage.getItem("quickEdit"));
  let jsCheck = gets('#jsCheck')
  quickEdit.js = jsCheck.checked
  console.log(quickEdit)
  localStorage.setItem('quickEdit',JSON.stringify(quickEdit)) 
})


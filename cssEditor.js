
var cssContent = $.trim($("#cssEditor").text());
$("#cssEditor").html("");

let savedcss = localStorage.getItem("css");


var cssEditor = monaco.editor.create(document.getElementById("cssEditor"), {
  value: savedcss,
  language: 'css',
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
window.cssEditor.getModel().onDidChangeContent(() => {saveItLocal('css') });
let cssCheck = gets('#cssCheck')

if(quickEdit.css){
  cssCheck.checked = true
}

cssCheck.addEventListener('change',()=>{
  let style = gets('#mystyle')

  let quickEdit = JSON.parse(localStorage.getItem("quickEdit"));
  let cssCheck = gets('#cssCheck')
  quickEdit.css = cssCheck.checked
  console.log(quickEdit)
  localStorage.setItem('quickEdit',JSON.stringify(quickEdit)) 
})
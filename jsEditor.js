
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

window.jsEditor.getModel().onDidChangeContent(() => { saveItLocal('js') });
let jsCheck = gets('#jsCheck')
if(quickEdit.js){
  jsCheck.checked = true
}

jsCheck.addEventListener('change', () => {
  let script = gets('#myscript2')
  let quickEdit = JSON.parse(localStorage.getItem("quickEdit"));
  let jsCheck = gets('#jsCheck')
  quickEdit.js = jsCheck.checked
  console.log(quickEdit)
  localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
})


 if (window.outerWidth <= 670) {
   alignNav(true)
 }

var onresize = function () {
  width = window.outerWidth;
  height = window.outerHeight;
  if (width <= 670) {
    alignNav(true)
  }else{
    alignNav(false)
  }
}

window.addEventListener("resize", onresize);

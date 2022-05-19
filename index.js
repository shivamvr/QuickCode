//----------------Theme------------

// fetch('./theme.json')
// .then(response => {
//    return response.json();
// })
// .then(data => console.log(data));

//   -------------------------------------
var codeContent = $.trim($("#CodeBlock").text());
$("#CodeBlock").html("");
let savedCode = localStorage.getItem("code");

var editor = monaco.editor.create(document.getElementById("CodeBlock"), {
  value: savedCode,
  language: "javascript",
  theme: "vs",
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
function saveIt() {
  let code = editor.getValue();
  localStorage.setItem("code", code);
}

window.editor.getModel().onDidChangeContent((event) => {saveIt()});

//---------------------Save-as-file----------------------------------
const saveBtn = get('#save')
function saveAsFile(sourceText, fileName) {
  var workElement = document.createElement("a");
  if ('download' in workElement) {
      workElement.href = "data:" + 'text/plain' + "charset=utf-8," + escape(sourceText);
      workElement.setAttribute("download", fileName);
      document.body.appendChild(workElement);
      var eventMouse = document.createEvent("MouseEvents");
      eventMouse.initMouseEvent("click", true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
      workElement.dispatchEvent(eventMouse);
      document.body.removeChild(workElement);
  } else throw 'File saving not supported for this browser';
}


saveBtn.onclick = function(){
  let code = editor.getValue();
  saveAsFile(code,'code.js')
}


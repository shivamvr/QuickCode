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

function saveFile(){
  let text = editor.getValue();
  var name = 'myfile.js';
  blob = new Blob([text], {type: "text/plain;charset=utf-8"});
  saveAs(blob, name);
  }

saveBtn.onclick = saveFile

// ------------------Open-file-----------------
let inputFile = get('#file')
inputFile.addEventListener("change", function () {
  var file = new FileReader();
    file.onload = () => {
      let text = file.result + ""
      console.log(text)
      localStorage.setItem('code',text)
      window.location.reload()
    };
    file.readAsText(this.files[0]);
});




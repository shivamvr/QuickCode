//----------------Theme------------


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

function saveItLocal() {
  let code = editor.getValue();
  localStorage.setItem("code", code);
}

window.editor.getModel().onDidChangeContent((event) => { saveItLocal() });

//---------------------Save-as-file----------------------------------
const fileNameInput = get('#filename')
const overylay = get('#overlay')
const saveBtn = get('#save')
const box = get('.box')
let fileName = 'localfile.txt' // getting file name from open file

//---------------------Handlers---------------------
const showOverlay = () => {
  get('#overlay').style.display = 'block'
}
const hideOverlay = () => {
  get('#overlay').style.display = 'none'
}

function saveFile() {
  fileName = fileNameInput.value
  let text = editor.getValue();
  blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  saveAs(blob, fileName);
  hideOverlay()
}

const downf = () => {
  saveFile()
}

//-----------------------------------------------------

overylay.onclick = hideOverlay
saveBtn.onclick = showOverlay
box.onclick = (e)=>{
  e. stopPropagation()
}

let ext = '.js'
if (!fileName) {
  fileNameInput.value = 'file_name' + ext
} else {
  fileNameInput.value = fileName;
}

fileNameInput.addEventListener('keypress', (e) => {
  if (e.key == 'Enter') {
    saveFile()
  }
})




// ------------------Open-file-----------------
let inputFile = get('#file')
inputFile.addEventListener("change", function () {
  var file = new FileReader();
  file.onload = () => {
    let text = file.result + ""
    console.log(text)
    localStorage.setItem('code', text)
    window.location.reload()
  };
  file.readAsText(this.files[0]);
});




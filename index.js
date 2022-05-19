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
  fileNameInput.focus()
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

//---------------custom-select-dropdown-----------

  
const select = document.querySelectorAll(".selectBtn");
const option = document.querySelectorAll(".option");
let index = 1;

select.forEach((a) => {
  a.addEventListener("click", (b) => {
    const next = b.target.nextElementSibling;
    next.classList.toggle("toggle");
    next.style.zIndex = index++;
  });
});

option.forEach((a) => {
  a.addEventListener("click", (b) => {
    b.target.parentElement.classList.remove("toggle");
    const parent = b.target.closest(".select").children[0];
    parent.setAttribute("data-type", b.target.getAttribute("data-type"));
    parent.innerText = b.target.innerText;
  });
});

let countA = 1;
let countB = 1;
document.querySelector('.selectA').addEventListener('click',()=>{
   if(countA % 2 == 0){
      let lang = document.querySelector('#lang').getAttribute("data-type")
      console.log(lang)
   }
  countA++
})
document.querySelector('.selectB').addEventListener('click',()=>{
   if(countB % 2 == 0){
     let theme = document.querySelector('#theme').getAttribute("data-type")
     console.log(theme)
   }
  countB++
})





//------------template-code-------------
const gets = (selector) => {
  return document.querySelector(selector)
}
const getsAll = (selector) => {
  return document.querySelectorAll(selector)
}
//------------------------------------------
var codeContent = $.trim($("#CodeBlock").text());
$("#CodeBlock").html("");
let savedCode = localStorage.getItem("code");
let quickEdit = JSON.parse(localStorage.getItem("quickEdit"))

if(!quickEdit){
  localStorage.setItem('quickEdit',JSON.stringify({theme:'vs', lang:'html',body: '#fff'}))
}

gets('body').style.background = quickEdit.body
gets('#theme').innerText = quickEdit.theme
gets('#lang').innerText = quickEdit.lang

var editor = monaco.editor.create(document.getElementById("CodeBlock"), {
  value: savedCode,
  language: quickEdit.lang,
  theme: quickEdit.theme,
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
const fileNameInput = gets('#filename')
const overylay = gets('#overlay')
const saveBtn = gets('#save')
const box = gets('.box')
let fileName = 'localfile.txt' // getting file name from open file

//---------------------Handlers---------------------
const showOverlay = () => {
  gets('#overlay').style.display = 'block'
  fileNameInput.focus()
}
const hideOverlay = () => {
  gets('#overlay').style.display = 'none'
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
let inputFile = gets('#file')
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

const setLang=(ln)=>{
  monaco.editor.setModelLanguage(editor.getModel(),ln)
}

document.querySelector('.selectA').addEventListener('click',()=>{
   if(countA % 2 == 0){
      let lang = document.querySelector('#lang').getAttribute("data-type")
      if(lang == 'html'){ 
        setLang('html')
      }else if(lang = 'js'){
        setLang('javascript')
      }else if(lang = 'css'){
        setLang('css')
      }else if(lang == 'Plaintext'){
        setLang('plaintext')
      }else if(lang == 'json'){
        setLang('json')
      }
   }
  countA++
})

function saveTheme(t,b){
  quickEdit.theme = t
  quickEdit.body = b
  localStorage.setItem('quickEdit',JSON.stringify(quickEdit))
}

document.querySelector('.selectB').addEventListener('click',()=>{
   if(countB % 2 == 0){
     let theme = document.querySelector('#theme').getAttribute("data-type")
     if(theme == 'theme1'){
       saveTheme('vs','#fff')
       monaco.editor.setTheme('vs')
       gets('body').style.background = '#fff'
     }else if(theme = 'theme2'){
      saveTheme('vs-dark','#1E1E1E')
      monaco.editor.setTheme('vs-dark')
      gets('body').style.background = '#1E1E1E'
     }
   }
  countB++
})

// import myTheme from './theme.mjs'
// console.log(myTheme)
//  let darkTheme = myTheme()
// var themeData = MonacoThemes.parseTmTheme(myTheme());
// console.log(themeData)
// monaco.editor.defineTheme('mytheme', darkTheme);

// ------------------Open-Code-New-Tab-------------

function openWin() {
 let savedCode = localStorage.getItem("code");
  var myWindow = window.open();
  var doc = myWindow.document;
  doc.open();
  doc.write(savedCode);
  doc.close();
  }
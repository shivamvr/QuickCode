//------------template-code-------------
const gets = (selector) => {
  return document.querySelector(selector)
}
const getsAll = (selector) => {
  return document.querySelectorAll(selector)
}


var codeContent = $.trim($("#CodeBlock").text());
$("#CodeBlock").html("");

let savedCode = localStorage.getItem("code");
let quickEdit = JSON.parse(localStorage.getItem("quickEdit"))

if (!quickEdit) {
  localStorage.setItem('quickEdit', JSON.stringify({ theme: 'vs', lang: 'html' }))
}

gets('#lang').innerText = quickEdit.lang
gets('#theme').innerText = quickEdit.theme

function displayRun(){
 let run =  gets('#openwin')
if(quickEdit.lang == 'html' || quickEdit.lang=='javascript' || quickEdit.lang=='plaintext'){
  run.style.display = 'block'
}else{
  run.style.display = 'none'
}
}
displayRun()

settheme(quickEdit.theme)

var editor = monaco.editor.create(document.getElementById("CodeBlock"), {
  value: savedCode,
  language: quickEdit.lang,
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
let fileName = false
//---------------------Handlers---------------------
const showOverlay = () => {
  gets('#overlay').style.display = 'block'
  if (!fileName) {
    fileNameInput.value = quickEdit.lang + 'file.' + ext
  }
  fileNameInput.focus()
}
const hideOverlay = () => {
  gets('#overlay').style.display = 'none'
}

function saveFile() {
  let fname = fileNameInput.value
  let text = editor.getValue();
  blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  saveAs(blob, fname);
  hideOverlay()
}

const downf = () => {
  saveFile()
}

//------------------------file-name-popup---------------------------

let fileExt = {
  js: 'javascript',
  txt: 'plaintext',
  json: 'json',
  html: 'html',
  css: 'css',
}

overylay.onclick = hideOverlay
saveBtn.onclick = showOverlay
box.onclick = (e) => {
  e.stopPropagation()
}

let ext = Object.keys(fileExt).find(key => fileExt[key] === quickEdit.lang);


if (!ext) {
  ext = 'txt'
}

fileNameInput.addEventListener('keypress', (e) => {
  if (e.key == 'Enter') {
    saveFile()
  }
})


// ------------------Open-file-----------------

function getExtension(filename) {
  let newName = filename.split('.').pop()
  if (fileExt[newName]) {
    return newName
  }
  return 'txt'
}

let inputFile = gets('#file')
inputFile.addEventListener("change", function () {
  var file = new FileReader();
  file.onload = () => {
    let text = file.result + ""
    localStorage.setItem('code', text)
    window.location.reload()
  };

  fileName = this.files[0].name
  fileNameInput.value = fileName
  let fExt = getExtension(fileName)
  setLang(fileExt[fExt])
  file.readAsText(this.files[0]);
});




//---------------custom-select-dropdown-----------

const select = getsAll(".selectBtn");
const option = getsAll(".option");
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

// ------------------------------------------------------------

const setLang = (ln) => {
  quickEdit.lang = ln
  localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
  monaco.editor.setModelLanguage(editor.getModel(), ln)
  ext = Object.keys(fileExt).find(key => fileExt[key] === quickEdit.lang);
  if (!fileName) {
    fileNameInput.value = quickEdit.lang + 'file.' + ext
  }
  displayRun()
}


gets('.selectA').addEventListener('click', () => {
  if (countA % 2 == 0) {
    let lang = gets('#lang').getAttribute("data-type")
    if (lang == 'html') {
      setLang('html')
    } else if (lang == 'javascript') {
      setLang('javascript')
    } else if (lang == 'css') {
      setLang('css')
    } else if (lang == 'plaintext') {
      setLang('plaintext')
    } else if (lang == 'json') {
      setLang('json')
    }
  }
  countA++
})

gets('.selectB').addEventListener('click', () => {
  if (countB % 2 == 0) {
    let theme = gets('#theme').getAttribute("data-type")
    if (theme == 'vs') {
      settheme('vs')
    } else if (theme == 'vs-dark') {
      settheme('vs-dark')
    } else if (theme == 'monokai') {
      settheme('monokai')
    } else if (theme == 'cobalt2') {
      settheme('cobalt2')
    } else if (theme == 'dracula') {
      settheme('dracula')
    }
  }
  countB++
})

// ------------------Open-Code-New-Tab-------------

function openWin() {
  let savedCode = localStorage.getItem("code");
  var myWindow = window.open();
  var doc = myWindow.document;
  doc.open();
  if(quickEdit.lang === 'javascript'){
    savedCode = `<script>${savedCode}</script>`
    console.log(savedCode)
  }else if(quickEdit.lang === 'plaintext'){
    savedCode = `<pre style="margin: .5rem">${savedCode}</pre>`
    console.log(savedCode)
  }else if(quickEdit.lang === 'html'){
    savedCode = `<div>${savedCode}</div>`
    console.log(savedCode)
  }
  doc.write(savedCode);
  doc.close();
}

//---------------------Themes--------------------
function settheme(themeName) {
  quickEdit.theme = themeName
  localStorage.setItem('quickEdit', JSON.stringify(quickEdit))

  if (themeName == 'vs' || themeName == 'vs-dark') {
    monaco.editor.setTheme(themeName)
    return
  }

  fetch("./" + themeName + ".json")
    .then(response => {
      return response.json();
    })
    .then((data) => {
      monaco.editor.defineTheme(themeName, data)
      monaco.editor.setTheme(themeName)
    })
}










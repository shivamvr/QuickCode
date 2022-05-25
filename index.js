//------------template-code-------------
emmetMonaco.emmetHTML(monaco)

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
if(quickEdit.lang==='html'){
  gets('.tabs').style.display = 'flex'
}

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

document.addEventListener("keydown", (e)=> {
  let key = e.which
  let ctrl = e.ctrlKey
  let shift = e.shiftKey
  if(key=='83'&&ctrl&&shift){
    showOverlay()
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
    fileNameInput.value = 'file.' + ext
  }
  let tabs =  gets('.tabs')
  if(quickEdit.lang==='html'){
   tabs.style.display = 'flex'
  }else{
    tabs.style.display = 'none'
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
  if(quickEdit.lang === 'html'){
    window.open("./app.html",'_blank') 
    return
  }
  let savedCode = localStorage.getItem("code");
  var myWindow = window.open();
  var doc = myWindow.document;
  doc.open();
  if(quickEdit.lang === 'javascript'){
    savedCode = `<script>${savedCode}</script>`
    console.log(savedCode)
  }else if(quickEdit.lang === 'plaintext'){
    savedCode = `<pre style="margin: .5rem">${savedCode.replaceAll('<','&lt').replaceAll('>','&gt')}</pre>`
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

//-------------Hide-show-and-align-navbar-------------------

let hidebtn = gets('#hidenav')
let showbtn = gets('#shownav')
let alignbtn = gets('#alignbtn')
function hidenav(){
  gets('nav').style.display = 'flex'
  showbtn.style.display = 'block'
  hidebtn.style.display = 'none'
}
function shownav(){
  gets('nav').style.display = 'none'
  showbtn.style.display = 'none'
  hidebtn.style.display = 'block'
}

let aligntop = true
function alignNave(){
  let nav =  gets('nav')
  let navItems =  getsAll('.item')
  if(aligntop){
   alignbtn.style.transform = 'rotate(0deg)'
   nav.style.height = '1000px'
   nav.style.width = '4%'
   nav.style.minWidth = '40px'
   nav.style.flexDirection = 'column';
   nav.style.justifyContent = 'start';
   nav.style.paddingTop = '4rem';
   nav.style.paddingRight = 0
   gets('body').style.flexDirection = 'row'
    gets('#CodeBlock').style.width = '100%'
    getsAll('.selectBtn').forEach(e=>e.style.display='none')
     navItems.forEach(e=>e.style.marginBottom='1rem')
     navItems.forEach(e=>e.style.marginRight=0)
    aligntop = false
    return
  }
  getsAll('.selectBtn').forEach(e=>e.style.display='flex')
  aligntop = true
  alignbtn.style.transform = 'rotate(-90deg)'
  nav.style.height = '40px'
  nav.style.width = '100%'
  nav.style.flexDirection = 'row';
  nav.style.justifyContent = 'flex-end';
  nav.style.paddingTop = '0';
  nav.style.paddingRight = '2rem'
  gets('body').style.flexDirection = 'column'
   gets('#CodeBlock').style.width = '100%'
   getsAll('.selectBtn').forEach(e=>e.style.display='flex')
    navItems.forEach(e=>e.style.marginBottom='0')
    navItems.forEach(e=>e.style.marginRight= '1rem')
}

alignbtn.addEventListener('click',alignNave)
hidebtn.addEventListener('click',hidenav)
showbtn.addEventListener('click',shownav)


// ---------------tabs----------------

let tab = getsAll('.tab')
tab.forEach((e)=>{
  e.addEventListener('click',makeActive)
})

function makeActive(e){
  console.log(e.target.id)
let jsTab = gets('#js')
let cssTab = gets('#css')
let mainTab = gets('#main')

  if(e.target.id==='main'){
    console.log('this is main')
    jsTab.classList.remove('active-tab')
    cssTab.classList.remove('active-tab')
    mainTab.classList.add('active-tab')
  }else if(e.target.id==='css'){
    console.log('this is css')
    mainTab.classList.remove('active-tab')
    jsTab.classList.remove('active-tab')
    cssTab.classList.add('active-tab')
  }else{
    console.log('this is js')
    cssTab.classList.remove('active-tab')
    mainTab.classList.remove('active-tab')
    jsTab.classList.add('active-tab')
  }

}

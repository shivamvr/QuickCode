//------------template-code-------------
emmetMonaco.emmetHTML(monaco)


const gets = (selector) => {
  return document.querySelector(selector)
}
const getsAll = (selector) => {
  return document.querySelectorAll(selector)
}
//---------------------------------------

var codeContent = $.trim($("#CodeBlock").text());
$("#CodeBlock").html("");

let savedCode = localStorage.getItem("code");
let quickEdit = JSON.parse(localStorage.getItem("quickEdit"))

if (!quickEdit) {
  localStorage.setItem('quickEdit', JSON.stringify({ theme: 'vs', lang: 'html', tab: 'main', js: false, css: false }))
  quickEdit = JSON.parse(localStorage.getItem("quickEdit"))
}

gets('#lang').innerText = quickEdit.lang
gets('#theme').innerText = quickEdit.theme

if (quickEdit.lang === 'html') {
  gets('.tabs').style.display = 'flex'
  makeActive(quickEdit.tab)
}

function displayRun() {
  let run = gets('#openwin')
  if (quickEdit.lang == 'html' || quickEdit.lang == 'javascript' || quickEdit.lang == 'plaintext') {
    run.style.visibility = 'visible'
  } else {
    run.style.visibility = 'hidden'
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

function saveItLocal(call) {
  if (call === 'main') {
    let code = editor.getValue();
    localStorage.setItem("code", code);
  } else if (call == 'css') {
    let css = cssEditor.getValue();
    localStorage.setItem("css", css);
  } else if (call === 'js') {
    let js = jsEditor.getValue();
    localStorage.setItem("js", js);
  }
}


window.editor.getModel().onDidChangeContent(() => { saveItLocal('main') });

//---------------------Save-as-file----------------------------------
const fileNameInput = gets('#filename')
const overylay = gets('#overlay')
const saveBtn = gets('#save')
const box = gets('.box')
let fileName = false
//---------------------Handlers---------------------
const showOverlay = () => {
  gets('#overlay').style.display = 'block'
  let activeTab = JSON.parse(localStorage.getItem("quickEdit")).tab
  if (activeTab == 'main') {
    fileNameInput.value = 'file.' + ext
  } else if (activeTab == 'css') {
    fileNameInput.value = 'file.css'
  } else if (activeTab == 'js') {
    fileNameInput.value = 'file.js'
  }
  fileNameInput.focus()
}
const hideOverlay = () => {
  gets('#overlay').style.display = 'none'
}

function saveFile() {
  let activeTab = JSON.parse(localStorage.getItem("quickEdit")).tab
  console.log(activeTab)
  let fname = fileNameInput.value
  let text = editor.getValue();
  let css = cssEditor.getValue();
  let js = jsEditor.getValue();
  if (activeTab == 'main') {
    blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    saveAs(blob, fname);
  } else if (activeTab == 'css') {
    blob = new Blob([css], { type: "text/plain;charset=utf-8" });
    saveAs(blob, fname);
  } else if (activeTab == 'js') {
    blob = new Blob([js], { type: "text/plain;charset=utf-8" });
    saveAs(blob, fname);
  }
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

document.addEventListener("keydown", (e) => {
  let key = e.which
  let ctrl = e.ctrlKey
  let shift = e.shiftKey
  if (key == '83' && ctrl && shift) {
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
    let activeTab = JSON.parse(localStorage.getItem('quickEdit')).tab
    let quickEd = JSON.parse(localStorage.getItem('quickEdit'))
    if (activeTab === 'main') {
      localStorage.setItem('code', text)

    } else if (activeTab === 'css') {
      localStorage.setItem('css', text)

    } else if (activeTab === 'js') {
      localStorage.setItem('js', text)

    }
    window.location.reload()
  };

  fileName = this.files[0].name
  fileNameInput.value = fileName
  let fExt = getExtension(fileName)
  let activeTab = JSON.parse(localStorage.getItem('quickEdit')).tab
  if (activeTab === 'main') {
    setLang(fileExt[fExt])
  }
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
  let quickEdit = JSON.parse(localStorage.getItem('quickEdit'))
  quickEdit.lang = ln
  localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
  monaco.editor.setModelLanguage(editor.getModel(), ln)
  ext = Object.keys(fileExt).find(key => fileExt[key] === quickEdit.lang);
  if (!fileName) {
    fileNameInput.value = 'file.' + ext
  }
  let tabs = gets('.tabs')
  if (quickEdit.lang === 'html') {
    tabs.style.display = 'flex'
  } else {
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
  if (quickEdit.lang === 'html') {
    window.open("./app.html", '_blank')
    return
  }
  let savedCode = localStorage.getItem("code");
  var myWindow = window.open();
  var doc = myWindow.document;
  doc.open();
  if (quickEdit.lang === 'javascript') {
    savedCode = `<script>${savedCode}</script>`
  } else if (quickEdit.lang === 'plaintext') {
    savedCode = `<pre style="margin: .5rem">${savedCode.replaceAll('<', '&lt').replaceAll('>', '&gt')}</pre>`
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
function hidenav() {
  gets('nav').style.display = 'flex'
  showbtn.style.display = 'block'
  hidebtn.style.display = 'none'
}
function shownav() {
  gets('nav').style.display = 'none'
  showbtn.style.display = 'none'
  hidebtn.style.display = 'block'
}

let aligntop = true

function alignNav(p) {
  let tabs = gets('.tabs')
  let verticalNav = gets('#vnav')
  if (p) {
    aligntop = false
    verticalNav.disabled = false
    alignbtn.style.transform = 'rotate(0deg)'
    return
  } else if (!p) {
    aligntop = true
    verticalNav.disabled = true
    alignbtn.style.transform = 'rotate(-90deg)'
    let lang = JSON.parse(localStorage.getItem('quickEdit')).lang
    if (lang == 'html') {
      tabs.style.display = 'flex'
    }
  }
}

alignbtn.addEventListener('click', () => { alignNav(aligntop) })
hidebtn.addEventListener('click', hidenav)
showbtn.addEventListener('click', shownav)

// ---------------tabs----------------

let tab = getsAll('.tab')
tab.forEach((e) => {
  e.addEventListener('click', () => {
    makeActive(e.id)
  })
})

let checkboxes = getsAll('.tab>input')
checkboxes.forEach((e) => e.addEventListener('click', (e) => e.stopPropagation()))

function makeActive(e) {
  let jsTab = gets('#js')
  let cssTab = gets('#css')
  let mainTab = gets('#main')
  let jsMonaco = gets('#jsEditor')
  let cssMonaco = gets('#cssEditor')
  let mainMonaco = gets('#CodeBlock')
  let lang = gets('.selectA')
  let openWin = gets('#openwin')
  let quickEdit = JSON.parse(localStorage.getItem("quickEdit"))

  if (e === 'main') {
    jsTab.classList.remove('active-tab')
    cssTab.classList.remove('active-tab')
    mainTab.classList.add('active-tab')
    mainMonaco.style.display = 'block'
    cssMonaco.style.display = 'none'
    jsMonaco.style.display = 'none'
    lang.style.visibility = 'visible'
    openWin.style.visibility = 'visible'
    quickEdit.tab = 'main'
    localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
  } else if (e === 'css') {
    mainTab.classList.remove('active-tab')
    jsTab.classList.remove('active-tab')
    cssTab.classList.add('active-tab')
    mainMonaco.style.display = 'none'
    cssMonaco.style.display = 'block'
    jsMonaco.style.display = 'none'
    lang.style.visibility = 'hidden'
    openWin.style.visibility = 'hidden'
    quickEdit.tab = 'css'
    localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
  } else if (e === 'js') {
    cssTab.classList.remove('active-tab')
    mainTab.classList.remove('active-tab')
    jsTab.classList.add('active-tab')
    mainMonaco.style.display = 'none'
    cssMonaco.style.display = 'none'
    jsMonaco.style.display = 'block'
    lang.style.visibility = 'hidden'
    openWin.style.visibility = 'visible'
    quickEdit.tab = 'js'
    localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
  }
}

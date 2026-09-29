//------------template-code-------------
emmetMonaco.emmetHTML(monaco)


const gets = (selector) => {
  return document.querySelector(selector)
}
const getsAll = (selector) => {
  return document.querySelectorAll(selector)
}
//---------------------------------------

gets("#CodeBlock").innerHTML = "";

//---------------------First-run-defaults-----------------------------
// Everything below assumes these keys exist and hold strings, so seed them
// before the first read: on a brand new browser they are all null.
const defaultSettings = { theme: 'vs-dark', lang: 'html', tab: 'main', js: false, css: false, vnav: false, split: false, splitLang: 'html' };

// themes stored before the dropdown values were corrected to match the file
// names on disk, which 404 on a case sensitive host. Declared up here because
// settheme() runs while the page is still loading.
const themeAliases = { ayudark: 'AyuDark', dracula: 'Dracula' };

['code', 'css', 'js'].forEach((key) => {
  if (localStorage.getItem(key) === null) {
    localStorage.setItem(key, '')
  }
});

// merged over the defaults so a missing, partial or corrupt object still has every key
const readSettings = () => {
  let saved
  try {
    saved = JSON.parse(localStorage.getItem("quickEdit"))
  } catch (err) {
    saved = null
  }
  return Object.assign({}, defaultSettings, saved)
}

// The one in-memory copy of the settings. Every write goes through
// saveSettings so this object and localStorage can never disagree: writing a
// stale copy back used to silently revert the active tab, the language and
// the split state.
let quickEdit = readSettings()

const saveSettings = (patch) => {
  Object.assign(quickEdit, readSettings(), patch)
  localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
  return quickEdit
}

saveSettings({})

let savedCode = localStorage.getItem("code");

gets('#lang').innerText = quickEdit.lang
gets('#theme').innerText = quickEdit.theme

if (quickEdit.lang === 'html') {
  gets('.tabs').style.display = 'flex'
  makeActive(quickEdit.tab)
  gets('#export').style.display = 'block'
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

// Shared setup for all four editors. The option names matter: lineNumber,
// glyphmargin and scrollBeyoundLastLine were misspelled and silently ignored,
// and the loose vertical/horizontal scrollbar sizes were never options at all
// (the nested scrollbar block is the real one).
const editorOptions = (value, language) => ({
  value: value,
  language: language,
  lineNumbers: "on",
  glyphMargin: false,
  scrollBeyondLastLine: false,
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
})

var editor = monaco.editor.create(document.getElementById("CodeBlock"), editorOptions(savedCode, quickEdit.lang));

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

function saveBySplit(call) {
  if (call === 'code') {
    let code = splitEditor.getValue();
    localStorage.setItem("code", code);
  } else if (call == 'css') {
    let css = splitEditor.getValue();
    localStorage.setItem("css", css);
  } else if (call === 'js') {
    let js = splitEditor.getValue();
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
  let activeTab = quickEdit.tab
  if (activeTab == 'main') {
    // keep the name of a file that was opened instead of overwriting it with
    // the generic default every time the dialog is shown
    fileNameInput.value = fileName || 'file.' + ext
  } else if (activeTab == 'css') {
    fileNameInput.value = 'file.css'
  } else if (activeTab == 'js') {
    fileNameInput.value = 'file.js'
  }
  fileNameInput.focus()
  fileNameInput.select()
}
const hideOverlay = () => {
  gets('#overlay').style.display = 'none'
}

function saveFile() {
  let activeTab = quickEdit.tab
  let content
  if (activeTab == 'main') {
    content = editor.getValue()
  } else if (activeTab == 'css') {
    content = cssEditor.getValue()
  } else if (activeTab == 'js') {
    content = jsEditor.getValue()
  } else {
    return
  }
  let fname = fileNameInput.value.trim() || 'file.' + ext
  let blob = new Blob([content], { type: "text/plain;charset=utf-8" });
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
  zip: 'zip'
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
  // e.which is deprecated, and without preventDefault the browser's own
  // save dialog can open on top of ours
  if ((e.key === 's' || e.key === 'S') && e.ctrlKey && e.shiftKey) {
    e.preventDefault()
    showOverlay()
  }
})

// ------------------Open-file-&-Project---------------

function getExtension(filename) {
  let newName = filename.split('.').pop()
  if (fileExt[newName]) {
    return newName
  }
  return 'txt'
}

let inputFile = gets('#file')
inputFile.addEventListener("change", function (e) {
  if (!this.files[0]) {
    return;
  }
  let ext = getExtension(this.files[0].name)
  let zipFile = e.target.files[0]
 //-------------------Open-project-----------------------
  if (ext === 'zip') {
    if (zipFile == undefined) {
      return;
    }
    var filename = zipFile.name;
    var reader = new FileReader();
    // ----------------------------------
    reader.onload = function (ev) {
      JSZip.loadAsync(ev.target.result).then(function (zip) {
        // read whichever of the three a QuickCode export normally holds, so a
        // zip that is missing one still imports instead of failing outright
        const pick = (name) => {
          let entry = zip.file(name)
          return entry ? entry.async('string') : Promise.resolve(null)
        }
        return Promise.all([
          pick('QuickCode/index.html'),
          pick('QuickCode/style.css'),
          pick('QuickCode/index.js')
        ])
      }).then((parts) => {
        let newHtml = parts[0]
        let newCss = parts[1]
        let newJs = parts[2]
        if (newHtml === null && newCss === null && newJs === null) {
          throw new Error('it contains no QuickCode/index.html, style.css or index.js')
        }
        if (newHtml !== null) {
          newHtml = newHtml.replace(`<link rel="stylesheet" href="style.css">`, '')
          newHtml = newHtml.replace(`<script src="index.js"></script>`, '')
          editor.getModel().setValue(newHtml);
        }
        if (newCss !== null) {
          cssEditor.getModel().setValue(newCss);
        }
        if (newJs !== null) {
          jsEditor.getModel().setValue(newJs);
        }
      }).catch(function (err) {
        // this used to fail with nothing but a console message
        console.error("Failed to open", filename, "as a QuickCode project:", err);
        alert('Could not open "' + filename + '" as a QuickCode project: ' + err.message)
      })
    };
    // ------------------------------------
    reader.onerror = function (err) {
      console.error("Failed to read file", err);
      alert('Could not read "' + filename + '".')
    }
    reader.readAsArrayBuffer(zipFile);
  }
 //---------------open-file------------------
  if (ext != 'zip') {
    var file = new FileReader();
    file.onload = () => {
      let text = file.result + ""
      let activeTab = quickEdit.tab
      if (activeTab === 'main') {
        editor.getModel().setValue(text);
      } else if (activeTab === 'css') {
        cssEditor.getModel().setValue(text);
      } else if (activeTab === 'js') {
        jsEditor.getModel().setValue(text);
      }
    };

    fileName = this.files[0].name
    fileNameInput.value = fileName
    let fExt = getExtension(fileName)
    let activeTab = quickEdit.tab
    if (activeTab === 'main') {
      setLang(fileExt[fExt])
    }
    file.readAsText(this.files[0]);
  }

  // the File objects above are already handed to the readers, and clearing the
  // input is what lets the same file be picked a second time: without this no
  // change event fires because the value has not changed
  this.value = '';
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

// ------------------------------------------------------------

const setLang = (ln) => {
  saveSettings({ lang: ln })
  monaco.editor.setModelLanguage(editor.getModel(), ln)
  ext = Object.keys(fileExt).find(key => fileExt[key] === quickEdit.lang);
  if (!ext) {
    ext = 'txt'
  }
  if (fileName) {
    // keep the opened file's base name, just follow the new language
    fileNameInput.value = fileName.replace(/\.[^.]*$/, '') + '.' + ext
  } else {
    fileNameInput.value = 'file.' + ext
  }
  let tabs = gets('.tabs')
  if (quickEdit.lang === 'html') {
    tabs.style.display = 'flex'
  } else {
    tabs.style.display = 'none'
  }
  // export only makes sense for a html project, and this has to follow the
  // language for the whole session, not just on the initial load
  gets('#export').style.display = quickEdit.lang === 'html' ? 'block' : 'none'
  displayRun()
}


// Apply the choice straight from the option that was clicked. This used to
// count clicks on the whole .select container and only act on even ones, so a
// stray click anywhere inside it (padding, the gap between options) swallowed
// the next selection and left the button label disagreeing with the editor.
getsAll('.selectA .option').forEach((opt) => {
  opt.addEventListener('click', () => {
    setLang(opt.getAttribute('data-type'))
  })
})

getsAll('.selectB .option').forEach((opt) => {
  opt.addEventListener('click', () => {
    settheme(opt.getAttribute('data-type'))
  })
})

// close any open dropdown when clicking away from it
document.addEventListener('click', (e) => {
  if (!e.target.closest('.select')) {
    getsAll('.selectDropdown').forEach((d) => d.classList.remove('toggle'))
  }
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
    savedCode = `<pre style="margin: .5rem">${savedCode.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</pre>`
  }
  doc.write(savedCode);
  doc.close();
}

//---------------------Themes--------------------
function settheme(themeName) {
  themeName = themeAliases[themeName] || themeName
  saveSettings({ theme: themeName })

  if (themeName == 'vs' || themeName == 'vs-dark') {
    monaco.editor.setTheme(themeName)
    return
  }

  fetch("./themes/" + themeName + ".json")
    .then(response => {
      if (!response.ok) {
        throw new Error("HTTP " + response.status)
      }
      return response.json();
    })
    .then((data) => {
      monaco.editor.defineTheme(themeName, data)
      monaco.editor.setTheme(themeName)
    })
    .catch((err) => {
      // without this the theme silently stayed on the previous one
      console.error("Failed to load theme", themeName, err)
      monaco.editor.setTheme('vs-dark')
      gets('#theme').innerText = 'vs-dark'
      saveSettings({ theme: 'vs-dark' })
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
    saveSettings({ vnav: true })
    return
  } else if (!p) {
    aligntop = true
    verticalNav.disabled = true
    saveSettings({ vnav: false })
    if (quickEdit.lang == 'html') {
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
    updateEditor(e.id)
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

  if (e === 'main') {
    jsTab.classList.remove('active-tab')
    cssTab.classList.remove('active-tab')
    mainTab.classList.add('active-tab')
    mainMonaco.style.display = 'block'
    cssMonaco.style.display = 'none'
    jsMonaco.style.display = 'none'
    lang.style.visibility = 'visible'
    openWin.style.visibility = 'visible'
    saveSettings({ tab: 'main' })
  } else if (e === 'css') {
    mainTab.classList.remove('active-tab')
    jsTab.classList.remove('active-tab')
    cssTab.classList.add('active-tab')
    mainMonaco.style.display = 'none'
    cssMonaco.style.display = 'block'
    jsMonaco.style.display = 'none'
    lang.style.visibility = 'hidden'
    openWin.style.visibility = 'hidden'
    saveSettings({ tab: 'css' })
  } else if (e === 'js') {
    cssTab.classList.remove('active-tab')
    mainTab.classList.remove('active-tab')
    jsTab.classList.add('active-tab')
    mainMonaco.style.display = 'none'
    cssMonaco.style.display = 'none'
    jsMonaco.style.display = 'block'
    lang.style.visibility = 'hidden'
    openWin.style.visibility = 'visible'
    saveSettings({ tab: 'js' })
  }

}

function updateSplit(e) {
  if (quickEdit.split) {
    if (e === 'html') {
      let code = editor.getValue()
      splitEditor.getModel().setValue(code);
    } else if (e === 'css') {
      let css = cssEditor.getValue()
      splitEditor.getModel().setValue(css);
    } else if (e === 'javascript') {
      let js = jsEditor.getValue()
      splitEditor.getModel().setValue(js);
    }
  }
}

// setValue() throws away the undo stack, so only reload an editor when what
// is stored actually differs from what it is showing. Switching tabs used to
// wipe undo history every single time.
function updateEditor(e) {
  let target
  let stored
  if (e === 'main') {
    target = editor
    stored = localStorage.getItem('code') || ''
  } else if (e === 'css') {
    target = cssEditor
    stored = localStorage.getItem('css') || ''
  } else if (e === 'js') {
    target = jsEditor
    stored = localStorage.getItem('js') || ''
  } else {
    return
  }

  if (target.getValue() !== stored) {
    target.getModel().setValue(stored);
  }
}

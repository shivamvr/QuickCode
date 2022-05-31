var splitContent = $.trim($("#splitEditor").text());
$("#splitEditor").html("");

let savedsplit = localStorage.getItem("split");

let splitLang = JSON.parse(localStorage.getItem("quickEdit")).splitLang
let splitLangCode = ''
let splitSave = 'code'

if (splitLang === 'html') {
  splitLangCode = savedCode
  splitSave = 'code'
} else if (splitLang === 'css') {
  splitLangCode = savedcss
  splitSave = 'css'
} else if (splitLang === 'javascript') {
  splitLangCode = savedjs
  splitSave = 'js'
}


var splitEditor = monaco.editor.create(document.getElementById("splitEditor"), {
  value: splitLangCode,
  language: quickEdit.splitLang,
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

window.splitEditor.getModel().onDidChangeContent(() => {
  let splitLang = JSON.parse(localStorage.getItem('quickEdit')).splitLang


  if (splitLang === 'html') {
    splitSave = 'code'
  } else if (splitLang === 'css') {
    splitSave = 'css'
  } else if (splitLang === 'javascript') {
    splitSave = 'js'
  }

  saveBySplit(splitSave)
});



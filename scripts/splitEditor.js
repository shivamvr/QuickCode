gets("#splitEditor").innerHTML = "";

let splitLang = quickEdit.splitLang
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


var splitEditor = monaco.editor.create(document.getElementById("splitEditor"), editorOptions(splitLangCode, quickEdit.splitLang));

//---------------------Save-to-loacalstorage--------------------------

window.splitEditor.getModel().onDidChangeContent(() => {
  let splitLang = quickEdit.splitLang
  if (splitLang === 'html') {
    splitSave = 'code'
  } else if (splitLang === 'css') {
    splitSave = 'css'
  } else if (splitLang === 'javascript') {
    splitSave = 'js'
  }
  
  saveBySplit(splitSave)
});



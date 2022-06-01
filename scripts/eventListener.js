

let scrollTop = gets('#top')
scrollTop.addEventListener('click', () => {
    gets('#CodeBlock').scrollTop = 0
})


alignNav(quickEdit.vnav)


if (window.outerWidth <= 670) {
    alignNav(true)
}


var onresize = function () {
    let width = window.outerWidth;
    // let height = window.outerHeight;
    if (width <= 670) {
        alignNav(true)
    } else {
        alignNav(false)
    }
}

let setSplit = false
let setSplitMenu = true
let singleicon = gets('.single')
let spliticon = gets('.splitsvg')
let split = gets('#split')
let contianer = gets('.contianer')
let editors = getsAll('.editor')

function splitMenu(lang) {
    let quickEdit = JSON.parse(localStorage.getItem('quickEdit'))
    quickEdit.splitLang = lang
    localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
    if (lang === 'html') {
        let code = localStorage.getItem('code')
        splitEditor.getModel().setValue(code);
        quickEdit.splitLang = 'html'
    } else if (lang === 'css') {
        let css = localStorage.getItem('css')
        splitEditor.getModel().setValue(css);
        quickEdit.splitLang = 'css'
    } else if (lang === 'js') {
        let js = localStorage.getItem('js')
        splitEditor.getModel().setValue(js);
        quickEdit.splitLang = 'javascript'
    }
    monaco.editor.setModelLanguage(splitEditor.getModel(), lang)
    doSplit()
    makeSplitTabActive(lang)
    updateSplit(lang)
}


function doSplit() {
    let quickEdit = JSON.parse(localStorage.getItem('quickEdit'))
    quickEdit.split = true
    localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
    let splitEditor = gets('#splitContainer')
    spliticon.style.display = 'none'
    singleicon.style.display = 'block'
    editors.forEach((e) => {
        e.style.width = '50%'
        splitEditor.style.display = 'block'
        contianer.style.display = 'none'
        setSplitMenu = true
    });
}

function makeSplitTabActive(e){
    let splithtml = gets('.splithtml')
    let splitcss = gets('.splitcss')
    let splitjs = gets('.splitjs')
    let splitTabs = getsAll('.splitTab')
  if(e === 'html'){
    splitTabs.forEach((e)=>{e.classList.remove('active-tab')})
    splithtml.classList.add('active-tab')
  }else if(e=== 'css'){
    splitTabs.forEach((e)=>{e.classList.remove('active-tab')})
    splitcss.classList.add('active-tab')
  }else if(e=== 'javascript'){
    splitTabs.forEach((e)=>{e.classList.remove('active-tab')})
    splitjs.classList.add('active-tab')
  }
}


function singleEditor() {
    let quickEdit = JSON.parse(localStorage.getItem('quickEdit'))
    quickEdit.split = false
    localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
    let splitEditor = gets('#splitContainer')
    singleicon.style.display = 'none'
    spliticon.style.display = 'block'
    contianer.style.display = 'none'
    editors.forEach((e) => {
        e.style.width = '100%'
        splitEditor.style.display = 'none'
    });
}

spliticon.addEventListener('click', () => {
    if (setSplitMenu) {
        setSplitMenu = false
        contianer.style.display = 'block'
    } else {
        setSplitMenu = true
        contianer.style.display = 'none'
    }
})

gets('#editor').addEventListener('click', () => {
    if (!setSplitMenu) {
        setSplitMenu = true
        contianer.style.display = 'none'
    }
})

if (quickEdit.split) {
    doSplit(quickEdit.splitLang)
    makeSplitTabActive(quickEdit.splitLang)
}

let htmlpre =  `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
    <link rel="stylesheet" href="style.css">
  </head>
  <body>`
let htmlpost = `
  </body>
 </html>`

let htmlScrpit = `<script src="index.js"></script>`


function exportProject(){
    let quickEdit = JSON.parse(localStorage.getItem('quickEdit'))
    if(quickEdit.lang === 'html'){
      var zip = new JSZip();
      let htmlCode = localStorage.getItem('code')
      let cssCode = localStorage.getItem('css')
      let jsCode = localStorage.getItem('js')
      if(htmlCode.includes('<body>') && htmlCode.includes('<head>')){
        htmlCode =   htmlCode.replace('</head>',`<link rel="stylesheet" href="style.css">
  </head>`)
        htmlCode =   htmlCode.replace('</body>',`<script src="index.js"></script>
 </body>`)
      }else{
          htmlCode = htmlpre+htmlCode+htmlScrpit+htmlpost
      }

      let html = new Blob([htmlCode], { type: "text/plain;charset=utf-8" });
      let css = new Blob([cssCode], { type: "text/plain;charset=utf-8" });
      let js = new Blob([jsCode], { type: "text/plain;charset=utf-8" });
      zip.file("QuickCode/index.html",html);
      zip.file("QuickCode/style.css", css);
      zip.file("QuickCode/index.js",js);
  
      zip.generateAsync({ type: "blob" }).then(function (content) {
        saveAs(content, "QuickCode.zip");
      });
    }
  }
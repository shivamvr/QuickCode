

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
  }else if(e=== 'js'){
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



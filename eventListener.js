

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
    let height = window.outerHeight;
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
let editors = getsAll('#editor>pre')

function splitMenu(lang) {
    console.log(lang)
    let quickEdit = JSON.parse(localStorage.getItem('quickEdit'))
    quickEdit.splitLang = lang
    console.log(quickEdit)
    localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
    doSplit()
    window.location.reload()
}


function doSplit(){
    let quickEdit = JSON.parse(localStorage.getItem('quickEdit'))
    quickEdit.split = true
    localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
    let splitEditor = gets('#splitEditor')
    spliticon.style.display = 'none'
    singleicon.style.display = 'block'
    editors.forEach((e) => {
        e.style.width = '50%'
        splitEditor.style.display = 'block'
        contianer.style.display = 'none'
        setSplitMenu = true
    });
}


function singleEditor() {
    let quickEdit = JSON.parse(localStorage.getItem('quickEdit'))
    quickEdit.split = false
    localStorage.setItem('quickEdit', JSON.stringify(quickEdit))
    let splitEditor = gets('#splitEditor')
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

if(quickEdit.split){
    doSplit(quickEdit.splitLang)
}
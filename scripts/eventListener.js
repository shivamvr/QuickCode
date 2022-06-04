

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

function makeSplitTabActive(e) {
    let splithtml = gets('.splithtml')
    let splitcss = gets('.splitcss')
    let splitjs = gets('.splitjs')
    let splitTabs = getsAll('.splitTab')
    if (e === 'html') {
        splitTabs.forEach((e) => { e.classList.remove('active-tab') })
        splithtml.classList.add('active-tab')
    } else if (e === 'css') {
        splitTabs.forEach((e) => { e.classList.remove('active-tab') })
        splitcss.classList.add('active-tab')
    } else if (e === 'javascript') {
        splitTabs.forEach((e) => { e.classList.remove('active-tab') })
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

let htmlpre = `<!DOCTYPE html>
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


function exportProject() {
    let quickEdit = JSON.parse(localStorage.getItem('quickEdit'))
    if (quickEdit.lang === 'html') {
        var zip = new JSZip();
        let htmlCode = localStorage.getItem('code')
        let cssCode = localStorage.getItem('css')
        let jsCode = localStorage.getItem('js')
        if (htmlCode.includes('<body>') && htmlCode.includes('<head>')) {
            htmlCode = htmlCode.replace('</head>', `<link rel="stylesheet" href="style.css">
  </head>`)
            htmlCode = htmlCode.replace('</body>', `<script src="index.js"></script>
 </body>`)
        } else {
            htmlCode = htmlpre + htmlCode + htmlScrpit + htmlpost
        }

        let html = new Blob([htmlCode], { type: "text/plain;charset=utf-8" });
        let css = new Blob([cssCode], { type: "text/plain;charset=utf-8" });
        let js = new Blob([jsCode], { type: "text/plain;charset=utf-8" });
        zip.file("QuickCode/index.html", html);
        zip.file("QuickCode/style.css", css);
        zip.file("QuickCode/index.js", js);

        zip.generateAsync({ type: "blob" }).then(function (content) {
            saveAs(content, "QuickCode.zip");
        });
    }
}

let codeLine = localStorage.code.split(/\r\n|\r|\n/).length
let cssLine = localStorage.css.split(/\r\n|\r|\n/).length
let jsLine = localStorage.js.split(/\r\n|\r|\n/).length

let ep = { lineNumber: 1000, column: 10000 }
editor.onDidBlurEditorWidget(() => {
    ep = editor.getPosition()
    let quickEdit = JSON.parse(localStorage.getItem('quickEdit'))
    let splitActive = quickEdit.split
    let splitlang = quickEdit.splitLang
    editorCode = editor.getValue()
    if (splitActive && splitlang === 'html') {
        splitEditor.getModel().setValue(editorCode)
    }
})

let cssp = { lineNumber: cssLine, column: 1 }
cssEditor.onDidBlurEditorWidget(() => {
    cssp = cssEditor.getPosition()
    let quickEdit = JSON.parse(localStorage.getItem('quickEdit'))
    let splitActive = quickEdit.split
    let splitlang = quickEdit.splitLang
    let cssCode = cssEditor.getValue()
    if (splitActive && splitlang === 'css') {
        splitEditor.getModel().setValue(cssCode)
    }
})
let jsp = { lineNumber: jsLine, column: 1 }
jsEditor.onDidBlurEditorWidget(() => {
    jsp = jsEditor.getPosition()
    let quickEdit = JSON.parse(localStorage.getItem('quickEdit'))
    let splitActive = quickEdit.split
    let splitlang = quickEdit.splitLang
    let jsCode = jsEditor.getValue()
    if (splitActive && splitlang === 'javascript') {
        splitEditor.getModel().setValue(jsCode)
    }
})

splitEditor.onDidFocusEditorWidget(() => {
    let quickEdit = JSON.parse(localStorage.getItem('quickEdit'))
    let activeTab = quickEdit.tab
    setTimeout(() => {
        if (activeTab == 'main') {
            splitEditor.setPosition(ep)
        }
        else if (activeTab == 'css') {
            splitEditor.setPosition(cssp)
        }
        if (activeTab == 'js') {
            splitEditor.setPosition(jsp)
        }
    }, 10)
})
let sp = { spLine: 1, column: 1 }

splitEditor.onDidBlurEditorWidget(() => {
    sp = splitEditor.getPosition()
    let quickEdit = JSON.parse(localStorage.getItem('quickEdit'))
    let splitActive = quickEdit.split
    let splitlang = quickEdit.splitLang
    let code = splitEditor.getValue()
    if (splitActive && splitlang === 'html') {
        editor.getModel().setValue(code)
    }
    else if (splitActive && splitlang === 'css') {
        cssEditor.getModel().setValue(code)
    }
    if (splitActive && splitlang === 'javascript') {
        jsEditor.getModel().setValue(code)
    }
})

let myEditor = [editor, cssEditor, jsEditor]

myEditor.forEach((e, i) => {
    setCursor(e, i)
})

function setCursor(e, i) {
    e.onDidFocusEditorWidget(() => {
        let quickEdit = JSON.parse(localStorage.getItem('quickEdit'))
        let splitLang = quickEdit.splitLang
        let splitActive = quickEdit.split
        setTimeout(() => {
            if (splitActive) {
                if (splitLang === 'html' && i === 0) {
                    editor.setPosition(sp)
                } else if (splitLang === 'css' && i === 1) {
                    jsEditor.setPosition(sp)
                } else if (splitLang === 'javascript' && i === 2) {
                    cssEditor.setPosition(sp)
                }
            }
        }, 10)
    })
}

function moveTop() {
    let tab = JSON.parse(localStorage.getItem('quickEdit')).tab
    if (tab === 'main') {
        editor.revealLine(1);
    } else if (tab === 'css') {
        cssEditor.revealLine(1);
    } else if (tab === 'js') {
        jsEditor.revealLine(1);
    }
    const range = editor.getModel().getFullModelRange();
    console.log('range:', range)
}

// -------------------------Actions---------------------------

let allEditors = [editor, cssEditor, jsEditor, splitEditor]

allEditors.forEach((e) => addAction(e))

function addAction(e) {
    e.addAction({
        id: 'my-unique-id', label: 'Toggle Word Wrap',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KEY_Z],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.5,
        togglewrap: true,
        run: function () {
            if (this.togglewrap) {
                e.updateOptions({ wordWrap: "on" })
                this.togglewrap = false
            } else {
                e.updateOptions({ wordWrap: "off" })
                this.togglewrap = true
            }
        }
    });

    e.addAction({
        id: 'copyLines_Down', label: 'Copy Lines Down ',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D],
        run: function () {
            e.trigger('copyLineDown', 'editor.action.copyLinesDownAction');
        }
    });

    e.addAction({
        id: 'addSelectionTo_Next', label: 'Add Selection TO NEXT',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_Q],
        run: function () {
            e.trigger('addSelectionToNext', 'editor.action.addSelectionToNextFindMatch');
        }
    });


    e.addAction({
        id: 'font_small',
        label: 'Font Zoom Out',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.US_MINUS],
        contextMenuGroupId: 'fontsmall',
        contextMenuOrder: 1.2,
        run: function () {
            e.trigger('font_small', 'editor.action.fontZoomOut');
        },
        precondition: null,
        keybindingContext: null,
        contextMenuGroupId: 'navigation',
    });

    e.addAction({
        id: 'font_big',
        label: 'Font Zoom In',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.US_EQUAL],
        contextMenuGroupId: 'fontbig',
        contextMenuOrder: 1.2,
        run: function () {
            e.trigger('font_big', 'editor.action.fontZoomIn');
        },
        precondition: null,
        keybindingContext: null,
        contextMenuGroupId: 'navigation',
    });

    e.addAction({
        id: 'font_reset',
        label: 'Font Reset',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KEY_0],
        contextMenuGroupId: 'fontreset',
        contextMenuOrder: 1.3,
        run: function () {
            e.trigger('font_reset', 'editor.action.fontZoomReset');
        },
        precondition: null,
        keybindingContext: null,
        contextMenuGroupId: 'navigation',
    });

    e.addAction({
        id: 'toggleFontLigatures',
        label: 'Toggle Font ligatures',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.4,
        toggleFontLigatures: true,
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KEY_L],
        run: function () {
            if (this.toggleFontLigatures) {
                e.updateOptions({ fontLigatures: true })
                this.toggleFontLigatures = false
            } else {
                e.updateOptions({ fontLigatures: false })
                this.toggleFontLigatures = true
            }
        }
    });

    e.addAction({
        id: 'toggleFoldAll',
        label: 'Fold All / Unfold All',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.5,
        toggleFoldAll: true,
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KEY_F],
        run: function () {
            if (this.toggleFoldAll) {
                e.trigger('fold all', 'editor.foldAll');
                this.toggleFoldAll = false
            } else {
                e.trigger('unfold all', 'editor.unfoldAll');
                this.toggleFoldAll = true
            }
        }
    });

}

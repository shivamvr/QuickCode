//=====================================================================
// Split view, cursor sync between panes, project export, editor actions,
// and the entry point monaco's loader calls once it is ready.
//=====================================================================

let splitMenuClosed = true

//------------------------------ split view ---------------------------

function splitMenu(lang) {
    if (!SPLIT_TABS[lang]) return
    saveSettings({ splitLang: lang })
    ensureSplitEditor()
    monaco.editor.setModelLanguage(splitEditor.getModel(), lang)
    doSplit()
    makeSplitTabActive(lang)
    updateSplit(lang)
}

// How much of the width the tab editor gets; the split pane takes the rest.
// Kept away from 0 and 1 so neither pane can be dragged out of existence.
const MIN_RATIO = 0.15
const MAX_RATIO = 0.85
let splitRatio = 0.5

const clampRatio = (r) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, Number(r) || 0.5))

// Widths stay inline rather than moving into a class, because the narrow
// layout in tabs.css overrides them with `width: 100% !important` to stack the
// panes, and that must keep winning.
function applySplitRatio() {
    getsAll('.editor').forEach((e) => { e.style.width = (splitRatio * 100) + '%' })
    gets('#splitContainer').style.width = ((1 - splitRatio) * 100) + '%'
}

function doSplit() {
    saveSettings({ split: true })
    ensureSplitEditor()
    gets('.splitsvg').style.display = 'none'
    gets('.single').style.display = 'block'
    applySplitRatio()
    gets('#splitContainer').style.display = 'block'
    gets('#splitHandle').style.display = 'block'
    gets('.container').style.display = 'none'
    splitMenuClosed = true
}

function singleEditor() {
    saveSettings({ split: false })
    gets('.single').style.display = 'none'
    gets('.splitsvg').style.display = 'block'
    gets('.container').style.display = 'none'
    getsAll('.editor').forEach((e) => { e.style.width = '100%' })
    gets('#splitContainer').style.display = 'none'
    gets('#splitHandle').style.display = 'none'
}

function wireSplitHandle() {
    const handle = gets('#splitHandle')

    handle.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        // capture keeps the events coming even when the pointer outruns the
        // handle, which it will during a fast drag
        handle.setPointerCapture(e.pointerId)
        const bounds = gets('#editor').getBoundingClientRect()

        const move = (ev) => {
            if (bounds.width <= 0) return
            splitRatio = clampRatio((ev.clientX - bounds.left) / bounds.width)
            applySplitRatio()
        }
        const up = (ev) => {
            handle.releasePointerCapture(ev.pointerId)
            handle.removeEventListener('pointermove', move)
            handle.removeEventListener('pointerup', up)
            // persist once at the end, not on every pointer move
            saveSettings({ splitRatio: splitRatio })
        }

        handle.addEventListener('pointermove', move)
        handle.addEventListener('pointerup', up)
    })
}

function makeSplitTabActive(lang) {
    getsAll('.splitTab').forEach((t) => {
        t.classList.toggle('active-tab', t.dataset.splitLang === lang)
    })
}

//------------------------- cursor sync between panes -----------------
// Each pane remembers where its caret was, so moving between the tab editors
// and the split pane does not jump the cursor somewhere unrelated.

const cursors = { main: null, css: null, js: null, split: { lineNumber: 1, column: 1 } }

function onEditorBlur(id) {
    const ed = TABS[id].get()
    if (!ed) return
    cursors[id] = ed.getPosition()
    // push into the split pane when it is showing the same language
    if (quickEdit.split && splitEditor && SPLIT_TABS[quickEdit.splitLang] === id) {
        syncValue(splitEditor, ed.getValue())
    }
}

function onEditorFocus(id) {
    if (!quickEdit.split || SPLIT_TABS[quickEdit.splitLang] !== id) return
    // monaco places the caret from the click itself, so apply ours after it
    setTimeout(() => {
        const ed = TABS[id].get()
        if (ed && cursors.split) ed.setPosition(cursors.split)
    }, 10)
}

function onSplitBlur() {
    cursors.split = splitEditor.getPosition()
    const id = SPLIT_TABS[quickEdit.splitLang]
    if (quickEdit.split && TABS[id]) {
        // the tab editor may not exist yet; its storage key is already current
        syncValue(TABS[id].get(), splitEditor.getValue())
    }
}

function onSplitFocus() {
    const pos = cursors[quickEdit.tab]
    if (!pos) return
    setTimeout(() => splitEditor.setPosition(pos), 10)
}

function moveTop() {
    const ed = TABS[quickEdit.tab] && TABS[quickEdit.tab].get()
    if (ed) ed.revealLine(1)
    // the split pane sits alongside the active tab, so send it up too
    if (quickEdit.split && splitEditor) splitEditor.revealLine(1)
}

//---------------------------- export project -------------------------

const htmlPre = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
    <link rel="stylesheet" href="style.css">
  </head>
  <body>`

const htmlPost = `
  </body>
 </html>`

const htmlScript = `<script src="index.js"></script>`

function exportProject() {
    if (quickEdit.lang !== 'html') return
    flushStorage()

    let htmlCode = contentOf('main')
    const cssCode = contentOf('css')
    const jsCode = contentOf('js')

    // <body class="..."> and any casing count as a full document too: a
    // literal '<body>' test sent those down the wrapping branch and produced
    // a document nested inside another document
    const hasHead = /<head[\s>]/i.test(htmlCode)
    const hasBody = /<body[\s>]/i.test(htmlCode)
    if (hasHead && hasBody) {
        htmlCode = htmlCode.replace(/<\/head>/i, `<link rel="stylesheet" href="style.css">
  </head>`)
        htmlCode = htmlCode.replace(/<\/body>/i, `<script src="index.js"></script>
 </body>`)
    } else {
        htmlCode = htmlPre + htmlCode + htmlScript + htmlPost
    }

    const zip = new JSZip()
    const asBlob = (text) => new Blob([text], { type: 'text/plain;charset=utf-8' })
    zip.file('QuickCode/index.html', asBlob(htmlCode))
    zip.file('QuickCode/style.css', asBlob(cssCode))
    zip.file('QuickCode/index.js', asBlob(jsCode))

    zip.generateAsync({ type: 'blob' }).then((content) => {
        saveAs(content, 'QuickCode.zip')
    })
}

//------------------------------- actions -----------------------------

function addAction(e) {
    e.addAction({
        id: 'toggleWordWrap',
        label: 'Toggle Word Wrap',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KEY_Z],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.5,
        togglewrap: true,
        run: function () {
            e.updateOptions({ wordWrap: this.togglewrap ? 'on' : 'off' })
            this.togglewrap = !this.togglewrap
        }
    });

    e.addAction({
        id: 'copyLines_Down',
        label: 'Copy Lines Down',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D],
        run: function () {
            e.trigger('copyLineDown', 'editor.action.copyLinesDownAction');
        }
    });

    e.addAction({
        id: 'addSelectionTo_Next',
        label: 'Add Selection To Next',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_Q],
        run: function () {
            e.trigger('addSelectionToNext', 'editor.action.addSelectionToNextFindMatch');
        }
    });

    e.addAction({
        id: 'font_big',
        label: 'Font Zoom In',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.US_EQUAL],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.1,
        run: function () {
            e.trigger('font_big', 'editor.action.fontZoomIn');
        }
    });

    e.addAction({
        id: 'font_small',
        label: 'Font Zoom Out',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.US_MINUS],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.2,
        run: function () {
            e.trigger('font_small', 'editor.action.fontZoomOut');
        }
    });

    e.addAction({
        id: 'font_reset',
        label: 'Font Reset',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KEY_0],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.3,
        run: function () {
            e.trigger('font_reset', 'editor.action.fontZoomReset');
        }
    });

    e.addAction({
        id: 'toggleFontLigatures',
        label: 'Toggle Font Ligatures',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KEY_L],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.4,
        toggleFontLigatures: true,
        run: function () {
            e.updateOptions({ fontLigatures: this.toggleFontLigatures })
            this.toggleFontLigatures = !this.toggleFontLigatures
        }
    });

    e.addAction({
        id: 'formatDocument',
        label: 'Format Document',
        // Alt+Shift+F: Ctrl+Shift+F is already fold all, and menu orders
        // 1.1 to 1.6 are taken
        keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KEY_F],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.7,
        run: function () {
            e.getAction('editor.action.formatDocument').run()
        }
    });

    e.addAction({
        id: 'toggleFoldAll',
        label: 'Fold All / Unfold All',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KEY_F],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.6,
        toggleFoldAll: true,
        run: function () {
            if (this.toggleFoldAll) {
                e.trigger('fold all', 'editor.foldAll');
            } else {
                e.trigger('unfold all', 'editor.unfoldAll');
            }
            this.toggleFoldAll = !this.toggleFoldAll
        }
    });
}

//------------------------------ split wiring -------------------------

function wireSplit() {
    const splitIcon = gets('.splitsvg')
    const toggleSplitMenu = () => {
        splitMenuClosed = !splitMenuClosed
        gets('.container').style.display = splitMenuClosed ? 'none' : 'block'
    }
    splitIcon.addEventListener('click', toggleSplitMenu)

    gets('#editor').addEventListener('click', () => {
        if (!splitMenuClosed) {
            splitMenuClosed = true
            gets('.container').style.display = 'none'
        }
    })

    // both the popup menu and the tabs above the split pane pick a language
    getsAll('[data-split-lang]').forEach((el) => {
        el.addEventListener('click', () => splitMenu(el.dataset.splitLang))
    })
    onClick(gets('.single'), singleEditor)

    splitRatio = clampRatio(quickEdit.splitRatio)
    wireSplitHandle()

    if (quickEdit.split) {
        doSplit()
        makeSplitTabActive(quickEdit.splitLang)
    }
}

//-------------------------------- boot -------------------------------
// Called from index.html once monaco's AMD loader has the editor ready, so
// nothing here touches monaco before it exists.

function bootQuickCode() {
    initCore()
    wireSplit()
}

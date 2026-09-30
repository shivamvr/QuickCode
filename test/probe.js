// Runs after the app has booted. Each case asserts against the real functions
// and posts a report back to the runner.
//
// Two rules learned from earlier debugging sessions:
//   - assert against the in-memory `quickEdit`, not localStorage: content
//     writes are batched, so reading storage directly gives false failures
//   - a test that passes because nothing executed is not a pass, so anything
//     checking isolation must also prove the code ran

(function () {
  // sessionStorage is the fallback for the offline case: its second load can be
  // served from the cache under a url with no ?case= on it
  var CASE = window.__case || sessionStorage.getItem('qc-case')
  var results = []

  function check(name, fn) {
    try {
      var r = fn()
      if (typeof r === 'string') r = { pass: true, detail: r }
      results.push({ name: name, pass: !!r.pass, detail: r.detail })
    } catch (err) {
      results.push({ name: name, pass: false, detail: err.name + ': ' + err.message })
    }
  }

  var ok = function (pass, detail) { return { pass: pass, detail: detail } }

  function report() {
    var x = new XMLHttpRequest()
    x.open('POST', '/__test/report', false)
    x.setRequestHeader('Content-Type', 'application/json')
    x.send(JSON.stringify({ case: CASE, results: results }))
  }

  // ------------------------------------------------------------------ core
  if (CASE === 'core') {
    check('no uncaught errors on a fresh load', function () {
      return ok(window.__errors.length === 0, window.__errors.join(' | ') || 'none')
    })

    check('every custom editor action is registered', function () {
      var ids = ['toggleWordWrap', 'copyLines_Down', 'addSelectionTo_Next',
        'font_big', 'font_small', 'font_reset', 'toggleFontLigatures', 'toggleFoldAll']
      var missing = ids.filter(function (id) { return !editor.getAction(id) })
      return ok(missing.length === 0, missing.length ? 'missing: ' + missing.join(', ') : ids.length + ' actions')
    })

    check('every key constant the app names actually exists', function () {
      // The failure mode of a monaco rename is subtler than it looks: an
      // undefined constant does NOT make the expression NaN, because
      // `KeyMod.Alt | undefined` coerces to `512`. The action registers with a
      // modifier-only binding, the context menu still works, and the shortcut
      // is silently wrong. So check the names resolve, not the arithmetic.
      var x = new XMLHttpRequest()
      x.open('GET', '/scripts/eventListener.js', false)
      x.send()
      if (x.status !== 200) return ok(false, 'could not read eventListener.js: ' + x.status)
      var src = x.responseText

      var missing = []
      var counted = 0
      ;['KeyCode', 'KeyMod'].forEach(function (group) {
        var re = new RegExp('monaco\.' + group + '\.([A-Za-z0-9_]+)', 'g')
        var seen = {}
        var m
        while ((m = re.exec(src))) {
          if (seen[m[1]]) continue
          seen[m[1]] = true
          counted++
          if (typeof monaco[group][m[1]] !== 'number') missing.push(group + '.' + m[1])
        }
      })

      if (counted === 0) return ok(false, 'found no key constants - has addAction moved?')
      return ok(missing.length === 0,
        missing.length ? 'undefined in this monaco build: ' + missing.join(', ')
                       : counted + ' distinct key constants all resolve')
    })

    check('only the main editor exists at boot', function () {
      return ok(!!editor && !cssEditor && !jsEditor && !splitEditor,
        'main=' + !!editor + ' css=' + !!cssEditor + ' js=' + !!jsEditor + ' split=' + !!splitEditor)
    })

    check('panes are created on first use', function () {
      makeActive('css'); makeActive('js'); makeActive('main')
      return ok(!!cssEditor && !!jsEditor, 'css=' + !!cssEditor + ' js=' + !!jsEditor)
    })

    check('content writes are batched', function () {
      ensureMainEditor()
      localStorage.setItem('code', 'BASE')
      var writes = 0
      var real = localStorage.setItem.bind(localStorage)
      localStorage.setItem = function (k, v) { writes++; return real(k, v) }
      for (var i = 0; i < 40; i++) {
        editor.executeEdits('t', [{ range: new monaco.Range(1, 1, 1, 1), text: 'x' }])
      }
      localStorage.setItem = real
      return ok(writes === 0, '40 edits caused ' + writes + ' synchronous writes')
    })

    check('flushing makes the text readable', function () {
      var live = editor.getValue()
      flushStorage()
      return ok(localStorage.getItem('code') === live, 'storage matches editor after flush')
    })

    check('every offered theme resolves', function () {
      var bad = []
      getsAll('.selectB .option').forEach(function (o) {
        var v = o.getAttribute('data-type')
        if (v === 'vs' || v === 'vs-dark') return
        var x = new XMLHttpRequest()
        x.open('GET', './themes/' + v + '.json', false)
        try { x.send() } catch (e) { bad.push(v + ':neterr'); return }
        if (x.status !== 200) bad.push(v + ':' + x.status)
      })
      var total = getsAll('.selectB .option').length
      return ok(bad.length === 0, bad.length ? 'failing: ' + bad.join(', ') : total + ' offered, all resolve')
    })

    check('all languages and tabs switch cleanly', function () {
      ;['plaintext', 'json', 'css', 'javascript', 'html'].forEach(setLang)
      TAB_IDS.forEach(function (id) { makeActive(id); updateEditor(id) })
      makeActive('main')
      return ok(quickEdit.lang === 'html' && quickEdit.tab === 'main',
        'lang=' + quickEdit.lang + ' tab=' + quickEdit.tab)
    })

    check('export produces one non-nested document', function () {
      setLang('html')
      setPaneText('main', '<!DOCTYPE html><html><head><title>t</title></head><body class="x"><p>hi</p></body></html>')
      setPaneText('css', 'p{color:teal}')
      setPaneText('js', 'console.log(1)')
      flushStorage()

      var captured = null
      var RealZip = window.JSZip
      window.JSZip = function () {
        this.file = function (name, blob) { if (/index\.html$/.test(name)) captured = blob }
        this.generateAsync = function () { return { then: function () {} } }
      }
      exportProject()
      window.JSZip = RealZip
      if (!captured) return ok(false, 'export produced no index.html')

      var x = new XMLHttpRequest()
      var url = URL.createObjectURL(captured)
      x.open('GET', url, false); x.send()
      URL.revokeObjectURL(url)
      var text = x.responseText
      var htmlCount = (text.match(/<html/gi) || []).length
      var linked = /href="style\.css"/.test(text) && /src="index\.js"/.test(text)
      return ok(htmlCount === 1 && linked,
        '<html> x' + htmlCount + ', css+js linked=' + linked)
    })

    check('the split can be resized and stays within bounds', function () {
      splitMenu('css')
      var handle = gets('#splitHandle')
      var editorBox = gets('#editor').getBoundingClientRect()
      if (handle.style.display !== 'block') return ok(false, 'handle not shown when split')

      var drag = function (fraction) {
        handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: editorBox.left + editorBox.width * 0.5 }))
        handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: editorBox.left + editorBox.width * fraction }))
        handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: editorBox.left + editorBox.width * fraction }))
        return quickEdit.splitRatio
      }

      var wide = drag(0.75)
      var narrow = drag(0.25)
      var clampedLow = drag(-5)
      var clampedHigh = drag(5)
      var pane = parseFloat(gets('#splitContainer').style.width)

      singleEditor()
      var collapsed = gets('#splitHandle').style.display

      return ok(Math.abs(wide - 0.75) < 0.02 && Math.abs(narrow - 0.25) < 0.02 &&
        clampedLow >= 0.15 && clampedHigh <= 0.85 &&
        pane > 0 && pane < 100 && collapsed === 'none',
        'drag to 0.75 -> ' + wide.toFixed(2) + ', to 0.25 -> ' + narrow.toFixed(2) +
        ', clamped ' + clampedLow.toFixed(2) + '/' + clampedHigh.toFixed(2) +
        ', pane width ' + pane.toFixed(1) + '%, handle hidden when single: ' + (collapsed === 'none'))
    })

    check('the split ratio persists', function () {
      splitMenu('css')
      saveSettings({ splitRatio: 0.3 })
      return ok(readSettings().splitRatio === 0.3, 'stored ratio = ' + readSettings().splitRatio)
    })

    check('emmet is enabled for html and css', function () {
      // expansion itself needs a real Tab keypress inside monaco, which is
      // fragile to simulate; this at least fails loudly if the library stops
      // exposing a mode we call
      return ok(typeof emmetMonaco.emmetHTML === 'function' && typeof emmetMonaco.emmetCSS === 'function',
        'emmetHTML=' + typeof emmetMonaco.emmetHTML + ' emmetCSS=' + typeof emmetMonaco.emmetCSS)
    })

    check('no errors after exercising everything', function () {
      return ok(window.__errors.length === 0, window.__errors.join(' | ') || 'none')
    })
  }

  // ------------------------------------------------------------ formatting
  function formattingChecks() {
    check('the format action is registered', function () {
      return ok(!!editor.getAction('formatDocument'), 'formatDocument present')
    })

    var ugly = { html: '<div><p>hi</p></div>', css: 'a{color:red;background:blue}', javascript: 'const x=[1,2,3];function f(  a ){return a}' }

    return loadPrettier().then(function (engine) {
      check('prettier loads', function () {
        return ok(typeof engine.format === 'function' && engine.plugins.length === 4,
          'format=' + typeof engine.format + ' plugins=' + engine.plugins.length)
      })
    }, function (err) {
      check('prettier loads', function () { return ok(false, 'load failed: ' + err.message) })
    })
      .then(function () {
        setLang('html')
        setPaneText('main', ugly.html)
        return editor.getAction('editor.action.formatDocument').run()
      })
      .then(function () {
        check('html is reformatted', function () {
          var out = editor.getValue()
          return ok(out !== ugly.html && out.indexOf('<p>hi</p>') > -1,
            JSON.stringify(out.slice(0, 80)) + '   console: ' + (window.__console.join(' | ') || 'quiet'))
        })
        makeActive('js'); ensureJsEditor()
        jsEditor.getModel().setValue(ugly.javascript)
        return jsEditor.getAction('editor.action.formatDocument').run()
      })
      .then(function () {
        check('javascript is reformatted', function () {
          var out = jsEditor.getValue()
          return ok(out !== ugly.javascript && out.indexOf('const x = [1, 2, 3]') > -1,
            JSON.stringify(out.slice(0, 80)))
        })
        // a syntax error must leave the buffer untouched rather than wipe it
        var broken = 'function ( { return'
        jsEditor.getModel().setValue(broken)
        return jsEditor.getAction('editor.action.formatDocument').run().then(function () {
          check('a syntax error leaves the buffer intact', function () {
            return ok(jsEditor.getValue() === broken, JSON.stringify(jsEditor.getValue()))
          })
        })
      })
      .then(function () {
        makeActive('main')
        setLang('html')
      })
  }

  // ------------------------------------------------ theme failure handling
  function waitFor(predicate, ms) {
    return new Promise(function (resolve) {
      var waited = 0
      var timer = setInterval(function () {
        waited += 50
        if (predicate() || waited >= ms) { clearInterval(timer); resolve(predicate()) }
      }, 50)
    })
  }

  function themeFallbackChecks() {
    var original = quickEdit.theme
    // a theme whose file has been deleted must stop asking on every load
    settheme('NoSuchThemeExists')
    return waitFor(function () { return quickEdit.theme === 'vs-dark' }, 4000)
      .then(function (reset) {
        check('a deleted theme resets to vs-dark once', function () {
          return ok(reset, 'stored theme after a 404 = ' + quickEdit.theme)
        })

        // ...but a passing network problem must NOT discard the choice
        var realFetch = window.fetch
        window.fetch = function () { return Promise.reject(new TypeError('Failed to fetch')) }
        settheme('Dracula')
        return waitFor(function () { return false }, 900).then(function () {
          window.fetch = realFetch
          check('a network failure keeps the chosen theme', function () {
            return ok(quickEdit.theme === 'Dracula',
              'stored theme after a network error = ' + quickEdit.theme)
          })
        })
      })
      .then(function () { settheme(original) })
  }

  // --------------------------------------------------- files on disk (FSA)
  // A real picker cannot be driven from a test, so the API is stubbed with a
  // handle that records what was written. That still exercises everything the
  // app owns: which path a click takes, the permission check, the unsaved
  // marker, and the fallback when the API is absent.
  function fakeHandle(name, text) {
    var store = { text: text, writes: 0, permission: 'granted' }
    return {
      name: name,
      kind: 'file',
      __store: store,
      getFile: function () { return Promise.resolve(new File([store.text], name, { type: 'text/plain' })) },
      queryPermission: function () { return Promise.resolve(store.permission) },
      requestPermission: function () { return Promise.resolve(store.permission) },
      createWritable: function () {
        if (store.permission !== 'granted') return Promise.reject(new DOMException('denied', 'NotAllowedError'))
        return Promise.resolve({
          write: function (t) { store.text = t; return Promise.resolve() },
          close: function () { store.writes++; return Promise.resolve() },
        })
      },
    }
  }

  function fileHandleChecks() {
    var realOpen = window.showOpenFilePicker
    var realSave = window.showSaveFilePicker
    var realSaveAs = window.saveAs
    var consoleAt = window.__console.length
    var downloads = []
    window.saveAs = function (blob, name) { downloads.push(name) }

    // a real file chooser would hang the run, so count the click and stop it
    var input = gets('#file')
    var inputClicks = 0
    input.addEventListener('click', function (e) { inputClicks++; e.preventDefault() })

    var ctrlS = function () {
      document.dispatchEvent(new KeyboardEvent('keydown',
        { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))
    }

    var handle = fakeHandle('page.html', '<h1>from disk</h1>')
    var pickerCalls = 0
    window.showOpenFilePicker = function () { pickerCalls++; return Promise.resolve([handle]) }

    makeActive('main')
    setLang('html')
    fileHandles.main = null
    markSaved('main')

    gets('label[for="file"]').click()

    return waitFor(function () { return editor.getValue() === '<h1>from disk</h1>' && !!fileHandles.main }, 3000)
      .then(function (loaded) {
        check('the open icon goes through the picker, not the hidden input', function () {
          return ok(pickerCalls === 1 && inputClicks === 0,
            'picker called ' + pickerCalls + 'x, input clicked ' + inputClicks + 'x')
        })
        check('a picked file lands in the pane and stays attached to it', function () {
          return ok(loaded && fileHandles.main === handle && gets('#filename').value === 'page.html',
            'text=' + JSON.stringify(editor.getValue()) +
            ' handle=' + (fileHandles.main && fileHandles.main.name) +
            ' name field=' + JSON.stringify(gets('#filename').value))
        })
        check('the title names the file a save would write to', function () {
          return ok(document.title === 'page.html - QuickCode', document.title)
        })

        editor.getModel().setValue('<h1>edited in quickcode</h1>')
        var dirtyTitle = document.title
        ctrlS()
        return waitFor(function () { return handle.__store.writes > 0 }, 3000).then(function (wrote) {
          check('Ctrl+S writes back to the file instead of downloading a copy', function () {
            return ok(wrote && handle.__store.text === '<h1>edited in quickcode</h1>' &&
              dirtyTitle.indexOf('●') === 0 && document.title.indexOf('●') === -1 &&
              downloads.length === 0,
              'on disk=' + JSON.stringify(handle.__store.text) +
              ' title while unsaved=' + JSON.stringify(dirtyTitle) +
              ' after save=' + JSON.stringify(document.title) +
              ' downloads=' + downloads.length)
          })
        })
      })
      .then(function () {
        // the write grant is separate from the read grant, and can be refused
        handle.__store.permission = 'denied'
        editor.getModel().setValue('<h1>must not reach disk</h1>')
        ctrlS()
        return waitFor(function () { return false }, 500).then(function () {
          check('a refused write permission leaves the file untouched', function () {
            return ok(handle.__store.text === '<h1>edited in quickcode</h1>' &&
              handle.__store.writes === 1 && document.title.indexOf('●') === 0,
              'on disk=' + JSON.stringify(handle.__store.text) +
              ' writes=' + handle.__store.writes + ' title=' + JSON.stringify(document.title))
          })
          handle.__store.permission = 'granted'
        })
      })
      .then(function () {
        // the mouse path: the toolbar icon opens the overlay, and its save
        // button writes to the open file while the name is left alone
        editor.getModel().setValue('<h1>saved from the overlay</h1>')
        var asked = 0
        window.showSaveFilePicker = function () { asked++; return Promise.resolve(fakeHandle('other.html', '')) }
        gets('#save').click()
        var overlayShown = gets('#overlay').style.display === 'block'
        var namePrefilled = gets('#filename').value
        gets('#savefile').click()
        return waitFor(function () { return handle.__store.writes > 1 }, 3000).then(function (wrote) {
          check('the save dialog writes to the open file, and still offers export', function () {
            return ok(overlayShown && namePrefilled === 'page.html' && wrote &&
              handle.__store.text === '<h1>saved from the overlay</h1>' && asked === 0 &&
              downloads.length === 0 && gets('#overlay').style.display === 'none' &&
              gets('#export').style.display === 'block',
              'overlay opened=' + overlayShown + ' name=' + JSON.stringify(namePrefilled) +
              ' on disk=' + JSON.stringify(handle.__store.text) +
              ' save-as pickers opened=' + asked + ' downloads=' + downloads.length +
              ' export visible=' + (gets('#export').style.display === 'block'))
          })
        })
      })
      .then(function () {
        // a different name in the dialog means Save as, not overwrite
        gets('#save').click()
        gets('#filename').value = 'copy.html'
        var chosen = fakeHandle('copy.html', '')
        window.showSaveFilePicker = function () { return Promise.resolve(chosen) }
        gets('#savefile').click()
        return waitFor(function () { return chosen.__store.writes > 0 }, 3000).then(function (wrote) {
          check('renaming in the save dialog does a save as', function () {
            return ok(wrote && chosen.__store.text === '<h1>saved from the overlay</h1>' &&
              fileHandles.main === chosen && handle.__store.writes === 2,
              'new file=' + JSON.stringify(chosen.__store.text) +
              ' pane now points at ' + (fileHandles.main && fileHandles.main.name) +
              ', original written ' + handle.__store.writes + 'x')
          })
          // the rest of the run expects the first handle back
          fileHandles.main = handle
          gets('#filename').value = handle.name
        })
      })
      .then(function () {
        var before = editor.getValue()
        var abort = function () { return Promise.reject(new DOMException('cancelled', 'AbortError')) }
        window.showOpenFilePicker = abort
        window.showSaveFilePicker = abort
        return Promise.all([openWithPicker(), saveFile()]).then(function () {
          check('cancelling either picker is a no-op', function () {
            return ok(editor.getValue() === before && downloads.length === 0 &&
              window.__console.length === consoleAt,
              'buffer unchanged=' + (editor.getValue() === before) +
              ' downloads=' + downloads.length +
              ' logged: ' + (window.__console.slice(consoleAt).join(' | ') || 'nothing'))
          })
        })
      })
      .then(function () {
        // Firefox and Safari: no picker at all, so the hidden input and the
        // download have to still work end to end
        delete window.showOpenFilePicker
        delete window.showSaveFilePicker
        fileHandles.main = null
        markSaved('main')

        gets('label[for="file"]').click()
        var dt = new DataTransfer()
        dt.items.add(new File(['<p>from the input</p>'], 'fallback.html', { type: 'text/html' }))
        input.files = dt.files
        input.dispatchEvent(new Event('change'))

        return waitFor(function () { return editor.getValue() === '<p>from the input</p>' }, 3000)
          .then(function (read) {
            check('with no picker the hidden input still opens a file', function () {
              return ok(read && inputClicks === 1 && input.value === '',
                'loaded=' + read + ', input clicked ' + inputClicks +
                'x, value cleared=' + (input.value === ''))
            })
            gets('#filename').value = 'fallback.html'
            return saveFile()
          })
          .then(function () {
            check('with no save picker it falls back to a download', function () {
              return ok(downloads.length === 1 && downloads[0] === 'fallback.html' && !fileHandles.main,
                'downloads: ' + (downloads.join(', ') || 'none') +
                ', handle attached=' + !!fileHandles.main)
            })
          })
      })
      .then(function () {
        check('no errors from any of the file paths', function () {
          return ok(window.__errors.length === 0 && window.__console.length === consoleAt,
            'errors: ' + (window.__errors.join(' | ') || 'none') +
            '; logged: ' + (window.__console.slice(consoleAt).join(' | ') || 'nothing'))
        })
        if (realOpen) window.showOpenFilePicker = realOpen
        if (realSave) window.showSaveFilePicker = realSave
        window.saveAs = realSaveAs
        fileHandles.main = null
        markSaved('main')
      })
  }

  // --------------------------------------------------------- pwa and offline
  function appCaches() {
    return caches.keys().then(function (names) {
      return names.filter(function (n) { return n.indexOf('quickcode-') === 0 })
    })
  }

  // Every url this document actually loaded. Taking it from the DOM rather than
  // from a list means adding a script to index.html without adding it to sw.js
  // fails here, and it picks up the files monaco's loader injects for itself.
  function loadedUrls() {
    var urls = []
    var add = function (u) {
      if (!u || u.indexOf('/__test/') > -1) return
      if (u.indexOf('http') !== 0) return          // blob: and data: are never fetched
      if (urls.indexOf(u) === -1) urls.push(u)
    }
    document.querySelectorAll('script[src]').forEach(function (el) { add(el.src) })
    document.querySelectorAll('link[href]').forEach(function (el) { add(el.href) })
    document.querySelectorAll('img[src]').forEach(function (el) { add(el.src) })
    getsAll('.selectB .option').forEach(function (o) {
      var v = o.getAttribute('data-type')
      if (v !== 'vs' && v !== 'vs-dark') add(new URL('./themes/' + v + '.json', location.href).href)
    })
    add(new URL('./app.html', location.href).href)
    return urls
  }

  function pngSize(buf) {
    var v = new DataView(buf)
    if (v.getUint32(0) !== 0x89504e47) return null
    return v.getUint32(16) + 'x' + v.getUint32(20)
  }

  function pwaChecks() {
    return navigator.serviceWorker.ready
      .then(function () { return waitFor(function () { return !!navigator.serviceWorker.controller }, 10000) })
      .then(function (controlled) {
        check('the service worker registers and takes control of the first load', function () {
          return ok(controlled, 'controller=' + (navigator.serviceWorker.controller
            ? navigator.serviceWorker.controller.scriptURL : 'none'))
        })
        return appCaches()
      })
      .then(function (names) {
        check('exactly one versioned cache exists', function () {
          return ok(names.length === 1, names.join(', ') || 'none')
        })
        if (!names.length) return null
        return caches.open(names[0])
      })
      .then(function (cache) {
        if (!cache) return null
        var wanted = loadedUrls()
        return Promise.all(wanted.map(function (u) {
          return cache.match(u).then(function (hit) { return hit ? null : u })
        })).then(function (misses) {
          var missing = misses.filter(Boolean)
          check('every file the page loads is in the offline cache', function () {
            return ok(missing.length === 0, missing.length
              ? 'not cached: ' + missing.map(function (u) { return u.replace(location.origin, '') }).join(', ')
              : wanted.length + ' urls, all cached')
          })
          return cache
        })
      })
      .then(function (cache) {
        if (!cache) return null
        // the language workers import this at runtime; with no network it can
        // only come from here
        return cache.keys().then(function (keys) {
          var urls = keys.map(function (k) { return k.url })
          check('monaco’s worker bundle is cached as well', function () {
            var worker = urls.filter(function (u) { return u.indexOf('workerMain.js') > -1 })
            return ok(worker.length === 1, worker.join(', ') || 'workerMain.js is not cached')
          })
          return cache
        })
      })
      .then(function (cache) {
        // the worker has to be a blob: url, not a data: one, or no service
        // worker controls it and importScripts cannot come from the cache
        check('the monaco worker runs from a blob url the service worker can see', function () {
          var url = window.MonacoEnvironment.getWorkerUrl()
          var isBlob = url.indexOf('blob:') === 0
          if (isBlob) URL.revokeObjectURL(url)
          return ok(isBlob, url.slice(0, 60))
        })
        return cache
      })
      .then(function (cache) {
        // markers only exist if a language service is actually running
        makeActive('css')
        ensureCssEditor()
        cssEditor.getModel().setValue('a { color: }')
        return waitFor(function () {
          return monaco.editor.getModelMarkers({ resource: cssEditor.getModel().uri }).length > 0
        }, 8000).then(function (gotMarkers) {
          check('the css language service is alive', function () {
            return ok(gotMarkers, gotMarkers
              ? JSON.stringify(monaco.editor.getModelMarkers({ resource: cssEditor.getModel().uri })[0].message)
              : 'no markers for invalid css after 8s')
          })
          cssEditor.getModel().setValue('')
          makeActive('main')
          return cache
        })
      })
      .then(function () {
        return fetch('./manifest.webmanifest').then(function (res) {
          return res.ok ? res.json().then(function (m) { return { res: res, m: m } }) : null
        })
      })
      .then(function (got) {
        if (!got) {
          check('the manifest is served and parses', function () { return ok(false, 'manifest did not load') })
          return null
        }
        var m = got.m
        check('the manifest has what an install needs', function () {
          var big = (m.icons || []).filter(function (i) { return parseInt(i.sizes, 10) >= 192 })
          var maskable = (m.icons || []).filter(function (i) { return (i.purpose || '').indexOf('maskable') > -1 })
          return ok(!!m.name && !!m.start_url && m.display === 'standalone' &&
            !!m.background_color && big.length > 0 && maskable.length > 0 &&
            (m.file_handlers || []).length > 0 &&
            got.res.headers.get('content-type').indexOf('manifest+json') > -1,
            'name=' + m.name + ' display=' + m.display + ' icons>=192: ' + big.length +
            ' maskable: ' + maskable.length + ' file_handlers: ' + (m.file_handlers || []).length +
            ' served as ' + got.res.headers.get('content-type'))
        })
        // the plan's warning: the old favicon was 64px, far too small to install
        return Promise.all((m.icons || []).map(function (icon) {
          return fetch(icon.src).then(function (r) {
            return r.ok ? r.arrayBuffer().then(function (b) {
              return { src: icon.src, declared: icon.sizes, real: pngSize(b) }
            }) : { src: icon.src, declared: icon.sizes, real: 'HTTP ' + r.status }
          })
        }))
      })
      .then(function (icons) {
        if (!icons) return
        check('every icon exists and is the size it claims', function () {
          var wrong = icons.filter(function (i) { return i.real !== i.declared })
          return ok(wrong.length === 0 && icons.length > 0, icons.map(function (i) {
            return i.src.split('/').pop() + ' ' + i.real + (i.real === i.declared ? '' : ' (claims ' + i.declared + ')')
          }).join(', '))
        })
      })
      .then(function () {
        // a dead server falls back to the cache, but a 404 is a real answer and
        // has to reach the app - settheme() depends on telling them apart
        return Promise.all([
          fetch('./scripts/index.js?__fail=1').then(function (r) {
            return r.ok ? r.text().then(function (t) { return 'ok:' + t.length }) : 'HTTP ' + r.status
          }, function (e) { return 'rejected:' + e.message }),
          fetch('./themes/NoSuchThemeExists.json').then(function (r) { return 'HTTP ' + r.status },
            function (e) { return 'rejected:' + e.message }),
        ])
      })
      .then(function (r) {
        check('a failing server falls back to the cache, a 404 does not', function () {
          return ok(r[0].indexOf('ok:') === 0 && r[1] === 'HTTP 404',
            'a 503 on a cached file gave ' + r[0] + ', a missing theme gave ' + r[1])
        })
      })
      .then(launchChecks)
  }

  // A launch from the operating system cannot be staged from inside a page, so
  // the consumer is called with handles directly. Everything it decides - which
  // pane the file belongs in, and whether replacing what is there needs asking -
  // is on this side of launchQueue.
  function launchChecks() {
    var realConfirm = window.confirm
    var asked = []
    window.confirm = function (msg) { asked.push(msg); return false }

    setLang('html')
    makeActive('main')
    TAB_IDS.forEach(function (id) { fileHandles[id] = null; markSaved(id) })
    setPaneText('main', '')
    setPaneText('css', '')
    setPaneText('js', '')

    var sheet = fakeHandle('site.css', 'body { margin: 0 }')
    var script = fakeHandle('app.js', 'console.log("launched")')

    return openLaunchedFiles([sheet, script])
      .then(function () {
        check('a launched file opens in the pane its type belongs to', function () {
          return ok(fileHandles.css === sheet && fileHandles.js === script && !fileHandles.main &&
            contentOf('css') === 'body { margin: 0 }' && contentOf('js') === 'console.log("launched")' &&
            asked.length === 0,
            'css pane=' + (fileHandles.css && fileHandles.css.name) +
            ' js pane=' + (fileHandles.js && fileHandles.js.name) +
            ' main pane=' + fileHandles.main + ' prompts=' + asked.length)
        })
        check('a launch leaves the pane showing, named, and ready for Ctrl+S', function () {
          return ok(quickEdit.tab === 'js' && gets('#js').classList.contains('active-tab') &&
            document.title === 'app.js - QuickCode' && quickEdit.lang === 'html',
            'active tab=' + quickEdit.tab + ' title=' + JSON.stringify(document.title) +
            ' language=' + quickEdit.lang)
        })

        // work that is in no file must not be replaced without asking
        makeActive('main')
        setPaneText('main', '<h1>unsaved work</h1>')
        return openLaunchedFiles([fakeHandle('page.html', '<h1>from the desktop</h1>')])
      })
      .then(function () {
        check('a launch will not silently replace work that is in no file', function () {
          return ok(asked.length === 1 && contentOf('main') === '<h1>unsaved work</h1>' && !fileHandles.main,
            'asked ' + asked.length + 'x, main pane still ' + JSON.stringify(contentOf('main')))
        })

        // ...and does replace it once that is allowed
        window.confirm = function () { return true }
        return openLaunchedFiles([fakeHandle('page.html', '<h1>from the desktop</h1>')])
      })
      .then(function () {
        check('a launch opens the file once replacing is allowed', function () {
          return ok(contentOf('main') === '<h1>from the desktop</h1>' &&
            !!fileHandles.main && document.title === 'page.html - QuickCode',
            'main=' + JSON.stringify(contentOf('main')) + ' title=' + JSON.stringify(document.title))
        })
        window.confirm = realConfirm
        TAB_IDS.forEach(function (id) { fileHandles[id] = null; markSaved(id) })
      })
  }

  // ------------------------------------------------------- offline (reload)
  // The server stops answering for everything but the suite's own endpoints,
  // then the page reloads: the whole app now has to come out of the cache.
  if (CASE === 'offline') {
    if (!sessionStorage.getItem('qc-phase')) {
      navigator.serviceWorker.ready
        .then(function () { return waitFor(function () { return !!navigator.serviceWorker.controller }, 15000) })
        .then(function (controlled) {
          if (!controlled) {
            check('the service worker took control before the network went away', function () {
              return ok(false, 'no controller after 15s')
            })
            report()
            return
          }
          sessionStorage.setItem('qc-phase', 'check')
          sessionStorage.setItem('qc-case', 'offline')
          var x = new XMLHttpRequest()
          x.open('GET', '/__test/offline', false)
          x.send()
          location.reload()
        })
      return
    }

    check('the editor starts with its own server unreachable', function () {
      var started = typeof editor !== 'undefined' && !!editor && typeof monaco !== 'undefined'
      return ok(started && window.__errors.length === 0,
        'editor built=' + started + '; errors: ' + (window.__errors.join(' | ') || 'none'))
    })

    check('the stylesheets came from the cache', function () {
      // verticalNav.css is not in this list on purpose: it ships disabled, and
      // chrome does not load a disabled <link> until something enables it
      var want = ['style.css', 'tabs.css']
      var loaded = want.filter(function (name) {
        return Array.prototype.some.call(document.styleSheets, function (sh) {
          try {
            return String(sh.href || '').indexOf('/styles/' + name) > -1 && sh.cssRules.length > 0
          } catch (e) {
            return false
          }
        })
      })
      return ok(loaded.length === want.length, loaded.join(' + ') || 'none of them')
    })

    check('the toolbar icons rendered', function () {
      var imgs = Array.prototype.filter.call(getsAll('nav img'), function (i) { return i.complete && i.naturalWidth > 0 })
      return ok(imgs.length >= 4, imgs.length + ' of ' + getsAll('nav img').length + ' nav icons loaded')
    })

    // Everything below goes through fetch(). A synchronous XMLHttpRequest is
    // NOT handed to the service worker, so it would reach the dead server and
    // fail however complete the cache is.
    Promise.all([
      fetch('./themes/Dracula.json').then(function (r) {
        return r.ok ? r.json().then(function (t) { return !!t.colors }) : 'HTTP ' + r.status
      }, function (e) { return 'rejected' }),
      fetch('./app.html').then(function (r) {
        return r.ok ? r.text().then(function (t) { return t.indexOf('sandbox') > -1 }) : 'HTTP ' + r.status
      }, function (e) { return 'rejected' }),
      // last, and the one that proves the rest meant something
      fetch('./themes/NoSuchThemeExists.json')
        .then(function (r) { return 'HTTP ' + r.status }, function (e) { return 'rejected' }),
    ]).then(function (r) {
      check('theme switching still works offline', function () {
        return ok(r[0] === true, 'Dracula.json came back: ' + r[0])
      })
      check('the preview page is cached too', function () {
        return ok(r[1] === true, 'app.html came back: ' + r[1])
      })
      check('the server really is down: an uncached url fails rather than being invented', function () {
        return ok(r[2] === 'rejected', 'uncached fetch gave ' + r[2])
      })
      report()
    })
    return
  }

  // --------------------------------------------------- persistence (reload)
  if (CASE === 'persist') {
    if (!sessionStorage.getItem('qc-phase')) {
      setPaneText('main', '<h1>kept</h1>')
      makeActive('css'); ensureCssEditor(); cssEditor.getModel().setValue('h1{color:teal}')
      makeActive('js'); ensureJsEditor(); jsEditor.getModel().setValue('console.log("kept")')
      gets('#cssCheck').click(); gets('#jsCheck').click()
      document.querySelector('.selectB .option[data-type="Dracula"]').click()
      splitMenu('css')
      makeActive('css')
      setVerticalNav(true)
      flushStorage()
      sessionStorage.setItem('qc-phase', 'check')
      location.reload()            // an in-flight theme fetch must not reset the stored theme
      return                       // the reloaded page does the reporting
    }

    check('settings survive a reload', function () {
      return ok(quickEdit.theme === 'Dracula' && quickEdit.tab === 'css' &&
        quickEdit.split === true && quickEdit.splitLang === 'css' &&
        quickEdit.vnav === true && quickEdit.css === true && quickEdit.js === true,
        JSON.stringify(quickEdit))
    })
    check('file contents survive a reload', function () {
      return ok(readStored('code') === '<h1>kept</h1>' &&
        readStored('css') === 'h1{color:teal}' &&
        readStored('js') === 'console.log("kept")',
        'code=' + JSON.stringify(readStored('code')) +
        ' css=' + JSON.stringify(readStored('css')) +
        ' js=' + JSON.stringify(readStored('js')))
    })
    check('the restored tab and split are applied to the DOM', function () {
      return ok(gets('#css').classList.contains('active-tab') &&
        gets('#splitContainer').style.display === 'block' && !!splitEditor,
        'css tab active=' + gets('#css').classList.contains('active-tab') +
        ' split shown=' + (gets('#splitContainer').style.display === 'block') +
        ' split editor built=' + !!splitEditor)
    })
    check('the vertical nav stylesheet is enabled', function () {
      return ok(!gets('#vnav').disabled, 'vnav sheet active=' + !gets('#vnav').disabled)
    })
    check('the checkboxes are restored', function () {
      return ok(gets('#cssCheck').checked && gets('#jsCheck').checked,
        'css=' + gets('#cssCheck').checked + ' js=' + gets('#jsCheck').checked)
    })
    check('no errors on the restoring load', function () {
      return ok(window.__errors.length === 0, window.__errors.join(' | ') || 'none')
    })
  }

  // --------------------------------------------------------- preview safety
  function runPreviewChecks() {
    var frame = document.getElementById('preview')

    check('the preview document was built', function () {
      var doc = String(frame.srcdoc || '')
      return ok(doc.length > 0 && doc.indexOf('postMessage') > -1,
        'srcdoc ' + doc.length + ' chars; host errors: ' +
        (window.__errors.join(' | ') || 'none') + '; head: ' + JSON.stringify(doc.slice(0, 120)))
    })

    check('the snippet actually executed', function () {
      var ran = window.__messages.indexOf('SNIPPET_RAN') > -1
      return ok(ran, 'messages: ' + (window.__messages.join(', ') || 'none'))
    })
    check('the snippet could not reach storage', function () {
      var blocked = window.__messages.some(function (m) { return m.indexOf('STORAGE_BLOCKED') === 0 })
      var writable = window.__messages.indexOf('STORAGE_WRITABLE') > -1
      return ok(blocked && !writable, window.__messages.join(', ') || 'none')
    })
    check('saved work survived the preview', function () {
      var intact = localStorage.getItem('code') &&
        localStorage.getItem('css') === 'body{color:teal}' &&
        localStorage.getItem('js') === '// a library the user wrote' &&
        localStorage.getItem('quickEdit') !== null
      return ok(!!intact,
        'css=' + JSON.stringify(localStorage.getItem('css')) +
        ' quickEdit=' + (localStorage.getItem('quickEdit') !== null))
    })
    check('the frame is sandboxed without same-origin', function () {
      var sb = frame.getAttribute('sandbox') || ''
      return ok(sb.indexOf('allow-scripts') > -1 && sb.indexOf('allow-same-origin') === -1, sb)
    })
    check('the frame is opaque to the host', function () {
      var reachable
      try { reachable = frame.contentDocument !== null } catch (e) { reachable = false }
      return ok(!reachable, 'contentDocument reachable=' + reachable)
    })
  }

  // The sandboxed frame reports asynchronously, so wait for it to speak rather
  // than guessing a delay; give up after 5s so a genuine silence still fails.
  if (CASE === 'preview-safe') {
    var waited = 0
    var poll = setInterval(function () {
      waited += 100
      if (window.__messages.length > 0 || waited >= 5000) {
        clearInterval(poll)
        runPreviewChecks()
        report()
      }
    }, 100)
  } else if (CASE === 'core') {
    // formatting has to fetch prettier, so the core case reports once it settles
    formattingChecks().then(themeFallbackChecks).then(fileHandleChecks).then(pwaChecks).then(report, function (err) {
      check('formatting checks completed', function () { return ok(false, String(err)) })
      report()
    })
  } else {
    report()
  }
})()

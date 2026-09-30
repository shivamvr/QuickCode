// Runs after the app has booted. Each case asserts against the real functions
// and posts a report back to the runner.
//
// Two rules learned from earlier debugging sessions:
//   - assert against the in-memory `quickEdit`, not localStorage: content
//     writes are batched, so reading storage directly gives false failures
//   - a test that passes because nothing executed is not a pass, so anything
//     checking isolation must also prove the code ran

(function () {
  var CASE = window.__case
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
    formattingChecks().then(themeFallbackChecks).then(report, function (err) {
      check('formatting checks completed', function () { return ok(false, String(err)) })
      report()
    })
  } else {
    report()
  }
})()

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

  // A case that hangs tells the runner nothing but "timed out". This turns it
  // into evidence: whatever was checked before it stopped, and where.
  var watchdog = setTimeout(function () {
    check('the case finished on its own', function () {
      return ok(false, 'still going after 90s; phase=' + (sessionStorage.getItem('qc-phase') || 'first') +
        '; page errors: ' + (window.__errors.join(' | ') || 'none') +
        '; logged: ' + (window.__console.join(' | ') || 'nothing'))
    })
    report()
  }, 90000)

  function report() {
    clearTimeout(watchdog)
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

    check('the keybindings actually fire from the keyboard', function () {
      // The whole risk of a monaco upgrade is a binding that registers happily
      // and is bound to the wrong key: an undefined constant is not NaN, it is
      // a valid number. Running the action proves nothing about that, so this
      // sends real keys at the editor and watches what happens.
      ensureMainEditor()
      var input = editor.getDomNode().querySelector('textarea.inputarea')
      if (!input) return ok(false, 'monaco has no input area to type into')

      var press = function (init) {
        var e = new KeyboardEvent('keydown', {
          bubbles: true, cancelable: true,
          key: init.key, code: init.code,
          ctrlKey: !!init.ctrl, altKey: !!init.alt, shiftKey: !!init.shift,
        })
        // monaco reads the legacy numeric keyCode, which a KeyboardEvent init
        // does not carry
        Object.defineProperty(e, 'keyCode', { get: function () { return init.keyCode } })
        Object.defineProperty(e, 'which', { get: function () { return init.keyCode } })
        input.dispatchEvent(e)
      }

      editor.focus()
      editor.getModel().setValue('one line')
      editor.setPosition({ lineNumber: 1, column: 1 })

      // Ctrl+D is rebound to copy-line-down, so the model grows a line
      press({ key: 'd', code: 'KeyD', keyCode: 68, ctrl: true })
      var duplicated = editor.getModel().getLineCount()

      // Alt+Z toggles word wrap, which the editor reports back
      var wrapBefore = editor.getOption(monaco.editor.EditorOption.wordWrap)
      press({ key: 'z', code: 'KeyZ', keyCode: 90, alt: true })
      var wrapAfter = editor.getOption(monaco.editor.EditorOption.wordWrap)

      editor.getModel().setValue('')
      return ok(duplicated === 2 && wrapBefore !== wrapAfter,
        'ctrl+D made ' + duplicated + ' lines (want 2); alt+Z took word wrap from ' +
        wrapBefore + ' to ' + wrapAfter)
    })

    check('no option the editor is created with is silently ignored', function () {
      // lineNumber, glyphmargin and scrollBeyoundLastLine were all misspelled
      // once and monaco said nothing for years. It ignores unknown options, so
      // the only way to notice is to ask whether it knows the name.
      var options = editorOptions('', 'html')
      var notOptions = ['value', 'language']     // create-time arguments, not options
      var unknown = Object.keys(options).filter(function (key) {
        return notOptions.indexOf(key) === -1 && !(key in monaco.editor.EditorOption)
      })
      return ok(unknown.length === 0,
        unknown.length ? 'monaco does not know: ' + unknown.join(', ')
                       : Object.keys(options).length + ' options, all recognised')
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
      // count database writes, not localStorage ones: a burst of typing must
      // not turn into a burst of puts
      var puts = 0
      var realPut = IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put = function () { puts++; return realPut.apply(this, arguments) }
      var syncWrites = 0
      var realSet = localStorage.setItem.bind(localStorage)
      localStorage.setItem = function (k, v) { syncWrites++; return realSet(k, v) }
      for (var i = 0; i < 40; i++) {
        editor.executeEdits('t', [{ range: new monaco.Range(1, 1, 1, 1), text: 'x' }])
      }
      IDBObjectStore.prototype.put = realPut
      localStorage.setItem = realSet
      return ok(puts === 0 && syncWrites === 0,
        '40 edits caused ' + puts + ' database writes and ' + syncWrites + ' synchronous ones')
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

    // emmet is checked in the promise chain below: asking a completion
    // provider for its suggestions is asynchronous.

    check('no errors after exercising everything', function () {
      return ok(window.__errors.length === 0, window.__errors.join(' | ') || 'none')
    })
  }

  // ---------------------------------------------------------- emmet
  // emmet-monaco-es works by registering a completion provider, not by binding
  // Tab: what the user sees as "type an abbreviation and press Tab" is the
  // suggest widget accepting its item. So the honest check is to ask the
  // provider what it offers - which also exercises the monaco model APIs the
  // library reaches into, and those are what an upgrade breaks.
  function emmetChecks() {
    // The providers the app itself registered, recorded by serve.js between
    // monaco loading and initCore running. Registering a second copy here and
    // disposing it - which is what this used to do - tore down state the live
    // one was still using, and monaco threw from inside its tokenizer a third
    // of the time.
    var captured = window.__providers || []

    // Ask every provider registered for the language, not the first one:
    // monaco registers its own html completions when the html mode loads, so
    // picking by order sometimes asked the wrong one. The claim being tested is
    // that typing the abbreviation offers the expansion - from whichever
    // provider offers it.
    //
    // It polls, because emmet reads monaco's tokens and monaco tokenizes
    // lazily: asked too early it returns nothing at all, or throws from inside
    // itself. Monaco's own suggest controller never calls a provider that
    // early. The editors' own models are used rather than throwaway ones, since
    // disposing a model mid-tokenization throws too.
    var ask = function (language, text, column, matches) {
      var providers = captured.filter(function (c) { return c.language === language })
      if (!providers.length) return Promise.resolve({ error: 'nothing registered for ' + language })

      var ed = language === 'css' ? ensureCssEditor() : ensureMainEditor()
      var model = ed.getModel()
      var before = model.getValue()
      model.setValue(text)

      var askOne = function (entry) {
        return Promise.resolve().then(function () {
          return entry.provider.provideCompletionItems(
            model, new monaco.Position(1, column), {}, { isCancellationRequested: false })
        }).then(function (result) {
          return ((result && result.suggestions) || []).map(function (i) { return String(i.insertText || '') })
        }, function () {
          return []          // one provider failing is not the question here
        })
      }

      var attempt = function (left) {
        return Promise.all(providers.map(askOne)).then(function (lists) {
          var items = []
          lists.forEach(function (list) { items = items.concat(list) })
          if (left <= 0 || items.filter(matches).length) return items
          return new Promise(function (r) { setTimeout(r, 150) }).then(function () {
            return attempt(left - 1)
          })
        })
      }

      return attempt(20).then(function (items) {
        model.setValue(before)
        return { items: items, providers: providers.length }
      }, function (err) {
        model.setValue(before)
        return { error: String((err && err.message) || err) }
      })
    }

    var expandsHtml = function (t) { return /<div class="a">/.test(t) && (t.match(/<li>/g) || []).length === 3 }
    var expandsCss = function (t) { return /margin:\s*10px/.test(t) }

    return Promise.all([
      ask('html', 'div.a>ul>li*3', 14, expandsHtml),
      ask('css', 'm10', 4, expandsCss),
    ]).then(function (results) {
      check('emmet still expands, in html and in css', function () {
        var html = results[0]
        var css = results[1]
        var expandedHtml = (html.items || []).filter(expandsHtml)[0]
        var expandedCss = (css.items || []).filter(expandsCss)[0]
        return ok(!!expandedHtml && !!expandedCss,
          'html: ' + (html.error || JSON.stringify(String(expandedHtml).slice(0, 50)) ||
            (html.items || []).length + ' suggestions from ' + html.providers + ' providers, none expanded') +
          '; css: ' + (css.error || JSON.stringify(expandedCss) ||
            (css.items || []).length + ' suggestions from ' + css.providers + ' providers, none expanded'))
      })
      check('emmet registered itself for both languages at boot', function () {
        var languages = captured.map(function (c) { return c.language })
        return ok(languages.indexOf('html') > -1 && languages.indexOf('css') > -1,
          captured.length + ' completion providers registered: ' + languages.join(', '))
      })
    })
  }

  // ---------------------------------------------------------- the themes
  // Every theme file is fed to defineTheme, and a newer monaco validates more
  // strictly than the one these were written for. A theme that throws is
  // swallowed by settheme's own catch, so the only thing that shows is the
  // editor not changing - which is what this measures.
  function rgbOf(hex) {
    var h = String(hex).replace('#', '')
    if (h.length === 8) h = h.slice(0, 6)
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    var n = parseInt(h, 16)
    return 'rgb(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ')'
  }

  function editorBackground() {
    var el = editor.getDomNode().querySelector('.monaco-editor-background') ||
      editor.getDomNode().querySelector('.monaco-editor')
    return el ? getComputedStyle(el).backgroundColor : 'no element'
  }

  function themeChecks() {
    var names = []
    getsAll('.selectB .option').forEach(function (o) {
      var v = o.getAttribute('data-type')
      if (v !== 'vs' && v !== 'vs-dark') names.push(v)
    })

    var failed = []
    var applied = 0
    var chain = Promise.resolve()
    names.forEach(function (name) {
      chain = chain.then(function () {
        return fetch('./themes/' + name + '.json').then(function (r) { return r.json() })
      }).then(function (data) {
        var want = data.colors && data.colors['editor.background']
        settheme(name)
        if (!want) return null               // nothing to measure it against
        var target = rgbOf(want)
        return waitFor(function () { return editorBackground() === target }, 3000)
          .then(function (matched) {
            applied++
            if (!matched) failed.push(name + ' (wanted ' + target + ', got ' + editorBackground() + ')')
          })
      })
    })

    return chain.then(function () {
      check('every theme applies, and none of them quietly falls back', function () {
        return ok(failed.length === 0 && applied > 0,
          failed.length ? 'did not take: ' + failed.join('; ')
                        : applied + ' of ' + names.length + ' themes measured, all applied')
      })
      check('the editor still looks the way it did before the upgrade', function () {
        // both default to on in 0.52 and both change the editor visibly
        var brackets = editor.getOption(monaco.editor.EditorOption.bracketPairColorization)
        var sticky = editor.getOption(monaco.editor.EditorOption.stickyScroll)
        return ok(brackets && brackets.enabled === false && sticky && sticky.enabled === false,
          'bracket colouring=' + (brackets && brackets.enabled) +
          ', sticky scroll=' + (sticky && sticky.enabled))
      })
      settheme('vs-dark')
    })
  }

  // --------------------------------------------------------- the store
  function storeChecks() {
    var live = editor.getValue()
    return flushStorage()
      .then(function () { return getProject(project.id) })
      .then(function (saved) {
        check('flushing writes the text to the database', function () {
          return ok(saved && saved.code === live, 'record matches the editor after flush')
        })
      })
      .then(function () {
        // A real FileSystemFileHandle, because the fake above proves nothing
        // about structured clone. This is what lets a reopened project still
        // know which file each pane came from.
        if (!navigator.storage || !navigator.storage.getDirectory) {
          check('a file handle survives being stored and read back', function () {
            return ok(false, 'no origin private file system here to make a real handle from')
          })
          return null
        }
        return navigator.storage.getDirectory()
          .then(function (dir) { return dir.getFileHandle('roundtrip.txt', { create: true }) })
          .then(function (real) { return saveHandle('probe-project', 'main', real) })
          .then(function () { return loadHandles('probe-project', ['main']) })
          .then(function (found) {
            check('a file handle survives being stored and read back', function () {
              return ok(!!found.main && found.main.name === 'roundtrip.txt' &&
                typeof found.main.createWritable === 'function',
                found.main ? 'read back ' + found.main.name + ', still a ' + found.main.kind +
                  ' handle' : 'nothing came back')
            })
            return forgetHandles('probe-project', ['main'])
          })
      })
      .then(function () {
        // the crash net: an IndexedDB write cannot be relied on to finish as
        // the page goes away, so the last state is dropped into localStorage
        // synchronously and adopted on the way back in
        cancelFlush()
        project.code = '<h1>typed but never written</h1>'
        snapshot(project)
        var onDisk = localStorage.getItem('quickcodeUnsaved')
        return adoptSnapshot()
          .then(function () { return getProject(project.id) })
          .then(function (saved) {
            check('work that never reached the database is recovered from the snapshot', function () {
              return ok(!!onDisk && saved.code === '<h1>typed but never written</h1>' &&
                localStorage.getItem('quickcodeUnsaved') === null,
                'snapshot taken=' + !!onDisk + ', record now ' + JSON.stringify(saved.code) +
                ', snapshot cleared=' + (localStorage.getItem('quickcodeUnsaved') === null))
            })
          })
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
  // The methods live on the prototype rather than on the object, so the only
  // own properties are data. That matters: a handle is put through structured
  // clone on its way into the handles store, and an object carrying functions
  // cannot be cloned - a real FileSystemFileHandle can.
  function FakeHandle(name, text) {
    this.name = name
    this.kind = 'file'
    this.__store = { text: text, writes: 0, permission: 'granted' }
  }
  FakeHandle.prototype.getFile = function () {
    return Promise.resolve(new File([this.__store.text], this.name, { type: 'text/plain' }))
  }
  FakeHandle.prototype.queryPermission = function () { return Promise.resolve(this.__store.permission) }
  FakeHandle.prototype.requestPermission = function () { return Promise.resolve(this.__store.permission) }
  FakeHandle.prototype.createWritable = function () {
    var store = this.__store
    if (store.permission !== 'granted') return Promise.reject(new DOMException('denied', 'NotAllowedError'))
    return Promise.resolve({
      write: function (t) { store.text = t; return Promise.resolve() },
      close: function () { store.writes++; return Promise.resolve() },
    })
  }

  function fakeHandle(name, text) { return new FakeHandle(name, text) }

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

  // ------------------------------------------------------- preview console
  function consoleRowsText() {
    return Array.prototype.map.call(getsAll('#consoleOut .logRow'), function (r) {
      return r.textContent
    })
  }

  function rowSaying(text) {
    return Array.prototype.filter.call(getsAll('#consoleOut .logRow'), function (r) {
      return r.textContent.indexOf(text) > -1
    })[0]
  }

  function whereOf(row) {
    var tag = row && row.querySelector('.logWhere')
    return tag ? tag.textContent : null
  }

  function previewChecks() {
    setLang('html')
    makeActive('main')
    gets('#cssCheck').checked = true
    gets('#jsCheck').checked = true
    saveSettings({ css: true, js: true })

    // the inline script is on line 3 of the html pane, and the js pane throws
    // on its line 3 - both have to come back as those numbers, not as lines of
    // the document that was generated
    setPaneText('main', '<h1>preview</h1>\n<p>hello</p>\n<script>throw new Error("from html")<\/script>')
    setPaneText('css', 'h1 { color: teal }')
    setPaneText('js', 'console.log("one", 2, { three: true })\nPromise.reject(new Error("nope"))\nthrow new Error("from js")')

    clearConsole()
    splitMenu('preview')

    return waitFor(function () { return consoleRowsText().length >= 4 }, 10000)
      .then(function (spoke) {
        check('the preview is a tab of the split view, with a console under it', function () {
          return ok(quickEdit.splitLang === 'preview' && quickEdit.split === true &&
            gets('#previewPane').style.display === 'flex' &&
            gets('#splitEditor').style.display === 'none' &&
            gets('#previewFrame').srcdoc.length > 0,
            'splitLang=' + quickEdit.splitLang + ' pane=' + gets('#previewPane').style.display +
            ' editor=' + gets('#splitEditor').style.display)
        })
        check('console output reaches the editor, every argument of it', function () {
          var row = rowSaying('one')
          return ok(!!row && row.textContent.indexOf('2') > -1 &&
            row.textContent.indexOf('"three":true') > -1,
            row ? JSON.stringify(row.textContent) : 'nothing logged: ' + consoleRowsText().join(' | '))
        })
        check('a thrown error is reported against the line in the editor', function () {
          var fromJs = rowSaying('from js')
          var fromHtml = rowSaying('from html')
          return ok(!!fromJs && whereOf(fromJs) === 'js:3' &&
            !!fromHtml && whereOf(fromHtml) === 'html:3',
            'js error at ' + whereOf(fromJs) + ' (want js:3), html error at ' +
            whereOf(fromHtml) + ' (want html:3)')
        })
        check('an unhandled promise rejection is reported too', function () {
          var row = rowSaying('Unhandled promise rejection')
          return ok(!!row && row.textContent.indexOf('nope') > -1,
            row ? JSON.stringify(row.textContent) : consoleRowsText().join(' | '))
        })
        check('errors are marked as errors, not as ordinary output', function () {
          var row = rowSaying('from js')
          var log = rowSaying('one')
          return ok(row && row.classList.contains('log-error') &&
            log && log.classList.contains('log-log'),
            'error row classes=' + (row && row.className) + ', log row classes=' + (log && log.className))
        })
        return spoke
      })
      .then(function () {
        // anything can post a message to this page; only the frame is believed
        var before = consoleRowsText().length
        window.postMessage({ __qc: true, kind: 'error', args: ['SPOOFED from the page'] }, '*')
        const stranger = document.createElement('iframe')
        stranger.sandbox = 'allow-scripts'
        stranger.style.display = 'none'
        stranger.srcdoc = '<scr' + 'ipt>parent.postMessage({__qc:true,kind:"error",' +
          'args:["SPOOFED from another frame"]},"*")<' + '/scr' + 'ipt>'
        document.body.appendChild(stranger)
        return waitFor(function () { return false }, 800).then(function () {
          check('a message from anywhere but the preview frame is ignored', function () {
            var texts = consoleRowsText().join(' | ')
            return ok(texts.indexOf('SPOOFED') === -1 && consoleRowsText().length === before,
              consoleRowsText().length + ' rows, was ' + before + '; contains SPOOFED=' +
              (texts.indexOf('SPOOFED') > -1))
          })
          stranger.remove()
        })
      })
      .then(function () {
        // editing rebuilds the frame's document; nothing reloads
        var frame = gets('#previewFrame')
        var was = frame.srcdoc
        setPaneText('css', 'h1 { color: rebeccapurple }')
        return waitFor(function () { return gets('#previewFrame').srcdoc !== was }, 5000)
          .then(function (rebuilt) {
            check('editing refreshes the preview in place', function () {
              return ok(rebuilt && gets('#previewFrame') === frame &&
                frame.srcdoc.indexOf('rebeccapurple') > -1,
                'same frame element=' + (gets('#previewFrame') === frame) +
                ', new css in the document=' + (frame.srcdoc.indexOf('rebeccapurple') > -1))
            })
          })
      })
      .then(function () {
        // stop has to be able to kill a script that is still running, which
        // means navigating the frame rather than just not rebuilding it
        stopPreview()
        var stopped = gets('#previewFrame').srcdoc === ''
        setPaneText('css', 'h1 { color: black }')
        return waitFor(function () { return false }, 700).then(function () {
          check('stop empties the frame and stays stopped while you type', function () {
            return ok(stopped && gets('#previewFrame').srcdoc === '',
              'emptied=' + stopped + ', still empty after an edit=' +
              (gets('#previewFrame').srcdoc === ''))
          })
          runPreview()
          return waitFor(function () { return gets('#previewFrame').srcdoc.length > 0 }, 5000)
        })
      })
      .then(function (running) {
        check('run starts it again', function () {
          return ok(running && gets('#previewFrame').srcdoc.indexOf('black') > -1,
            'rebuilt=' + running)
        })
      })
      .then(function () {
        // The offsets on their own, against the document that was actually
        // built rather than against the map that describes it: the whole scheme
        // rests on nothing QuickCode injects above the user's code carrying a
        // newline, and only the document itself can show that.
        var lineIn = function (text, needle) {
          var at = text.indexOf(needle)
          return at < 0 ? -1 : text.slice(0, at).split('\n').length
        }

        var wholeSrc = '<html>\n<head></head>\n<body>\n<script>x()<\/script>\n</body>\n</html>'
        var whole = buildPreviewDoc({ code: wholeSrc, css: 'a{}\nb{}', js: 'y()' },
          { lang: 'html', css: true, js: true })
        var fragmentSrc = '<h1>one</h1>\n<p>two</p>\n<script>z()<\/script>'
        var fragment = buildPreviewDoc({ code: fragmentSrc, css: 'a{}\nb{}', js: 'w()' },
          { lang: 'html', css: true, js: true })
        var jsMode = buildPreviewDoc({ code: 'var a = 1\nthrow new Error("x")' },
          { lang: 'javascript' })

        check('nothing injected above the user\u2019s code moves their lines', function () {
          var wholeSame = lineIn(wholeSrc, 'x()') === lineIn(whole.html, 'x()')
          var fragmentShift = lineIn(fragment.html, 'z()') - lineIn(fragmentSrc, 'z()')
          // a fragment is wrapped, so its lines may move - but only by the
          // amount the map says they did
          var claimed = fragment.sources['quickcode-html'].startLine - 1
          return ok(wholeSame && fragmentShift === claimed,
            'a whole document is untouched=' + wholeSame +
            '; a fragment moved by ' + fragmentShift + ' and the map says ' + claimed)
        })

        check('each pane\u2019s recorded start really is where its code begins', function () {
          var jsAt = lineIn(whole.html, 'y()')
          var jsClaimed = whole.sources['quickcode-js'].startLine
          var mainAt = lineIn(jsMode.html, 'var a = 1')
          var mainClaimed = jsMode.sources['quickcode-js'].startLine
          return ok(jsAt === jsClaimed && mainAt === mainClaimed,
            'js pane starts on ' + jsAt + ', recorded as ' + jsClaimed +
            '; javascript mode starts on ' + mainAt + ', recorded as ' + mainClaimed)
        })

        check('a reported line becomes the right line in the editor', function () {
          // the throw is on line 2 of the main pane in javascript mode
          var a = previewLocation(jsMode.sources, 'quickcode-js', jsMode.sources['quickcode-js'].startLine + 1)
          // line 4 of a whole document is still line 4
          var b = previewLocation(whole.sources, 'about:srcdoc', 4)
          var c = previewLocation(whole.sources, 'quickcode-js', whole.sources['quickcode-js'].startLine)
          return ok(a && a.pane === 'main' && a.line === 2 &&
            b && b.pane === 'main' && b.line === 4 &&
            c && c.pane === 'js' && c.line === 1,
            'javascript mode -> ' + JSON.stringify(a) + ', whole document -> ' + JSON.stringify(b) +
            ', its js pane -> ' + JSON.stringify(c))
        })

        check('nothing is invented when there is nothing to say', function () {
          return ok(previewLocation({}, 'somewhere-else', 12) === null &&
            previewLocation(whole.sources, 'about:srcdoc', 0) === null,
            'an unknown source and a missing line both give null')
        })
      })
      .then(function () {
        // what a reload does: the settings say preview, and the pane has to
        // come back showing, not just the tab looking active
        singleEditor()
        saveSettings({ split: true, splitLang: 'preview' })
        restoreSplit()
        return waitFor(function () { return gets('#previewFrame').srcdoc.length > 0 }, 5000)
      })
      .then(function (rebuilt) {
        check('a restored session comes back with the preview showing', function () {
          return ok(rebuilt && gets('#previewPane').style.display === 'flex' &&
            gets('.splitTab.splitpreview').classList.contains('active-tab') &&
            gets('#splitEditor').style.display === 'none',
            'pane=' + gets('#previewPane').style.display +
            ', tab marked=' + gets('.splitTab.splitpreview').classList.contains('active-tab') +
            ', document rebuilt=' + rebuilt)
        })
        singleEditor()
        clearConsole()
      })
  }

  // -------------------------------------------------------------- history
  function historyChecks() {
    var home = project
    var realIdle = SNAPSHOT_IDLE_MS
    var realConfirm = window.confirm
    var mine = makeProject({ name: 'history under test', code: 'first', css: 'a{}', js: '// one' })

    return saveProject(mine)
      .then(function () { return openRecord(mine) })
      .then(function () {
        // an edit, then quiet: the snapshot is taken once the typing stops, not
        // on a timer that runs regardless
        SNAPSHOT_IDLE_MS = 150
        setPaneText('main', 'second')
        return waitFor(function () { return true }, 0).then(function () {
          return new Promise(function (resolve) { setTimeout(resolve, 600) })
        })
      })
      .then(function () { return listSnapshots(mine.id) })
      .then(function (rows) {
        check('going quiet after an edit saves a snapshot', function () {
          return ok(rows.length === 1 && rows[0].reason === 'idle' && rows[0].code === 'second',
            rows.length + ' snapshots: ' + rows.map(function (r) {
              return r.reason + '/' + JSON.stringify(r.code)
            }).join(', '))
        })
        SNAPSHOT_IDLE_MS = realIdle
        // nothing has changed, so asking again must not write another
        return snapshotNow('asked for').then(function (row) {
          return listSnapshots(mine.id).then(function (after) {
            check('an unchanged project does not pile up identical snapshots', function () {
              return ok(row === null && after.length === rows.length,
                'a second snapshot returned ' + row + ', total still ' + after.length)
            })
          })
        })
      })
      .then(function () {
        // Type again first. Without a change there is nothing new to keep - the
        // idle snapshot above already holds this exact content, and the dedup
        // is right to refuse a second copy of it under a different label.
        setPaneText('main', 'third')
        // opening a file replaces a pane outright, so the state before it has
        // to be kept
        return openHandle(fakeHandle('dropped-in.html', 'from a file'), 'main')
      })
      .then(function () { return listSnapshots(mine.id) })
      .then(function (rows) {
        check('opening a file keeps what it replaced', function () {
          var before = rows.filter(function (r) { return r.reason === 'file opened' })[0]
          return ok(!!before && before.code === 'third' && contentOf('main') === 'from a file',
            'snapshot holds ' + JSON.stringify(before && before.code) +
            ', the pane now holds ' + JSON.stringify(contentOf('main')))
        })
        // restore the state from before the file, then undo that restore
        var target = rows.filter(function (r) { return r.reason === 'file opened' })[0]
        window.confirm = function () { return true }
        if (!target) return null          // reported above; do not take the rest down with it
        return restoreSnapshot(target.id)
      })
      .then(function () {
        check('restoring puts all three panes back', function () {
          return ok(contentOf('main') === 'third' && contentOf('css') === 'a{}' &&
            contentOf('js') === '// one',
            'main=' + JSON.stringify(contentOf('main')) + ' css=' + JSON.stringify(contentOf('css')))
        })
        return listSnapshots(mine.id)
      })
      .then(function (rows) {
        var undo = rows.filter(function (r) { return r.reason === 'before-restore' })[0]
        check('the restore itself is undoable', function () {
          return ok(!!undo && undo.code === 'from a file',
            'the pre-restore snapshot holds ' + JSON.stringify(undo && undo.code))
        })
        if (!undo) return null          // reported above
        return restoreSnapshot(undo.id)
      })
      .then(function () {
        check('undoing the restore lands exactly where it started', function () {
          return ok(contentOf('main') === 'from a file',
            'main=' + JSON.stringify(contentOf('main')))
        })
        window.confirm = realConfirm

        // the menu lists them, newest first, with a way to take one by hand
        return refreshHistory()
      })
      .then(function () {
        check('the history menu lists them, newest first, each with a way to delete or compare it', function () {
          var rows = getsAll('#historyList [data-snapshot]')
          var actions = getsAll('#historyList [data-history-action]')
          var crosses = getsAll('#historyList [data-delete-snapshot]')
          var compares = getsAll('#historyList [data-diff-snapshot]')
          return ok(rows.length >= 3 && actions.length === 2 && crosses.length === rows.length &&
            compares.length === rows.length && rows[0].textContent.length > 0,
            rows.length + ' entries, ' + crosses.length + ' delete crosses, ' +
            compares.length + ' compare glyphs, ' + actions.length + ' actions; first reads ' +
            JSON.stringify(rows[0] && rows[0].textContent))
        })
      })
      .then(function () {
        // naming one by hand, and naming a state that is already saved
        var realPrompt = window.prompt
        window.prompt = function () { return '  before the rewrite  ' }
        setPaneText('main', 'worth marking')
        return snapshotWithTitle()
          .then(function () { return listSnapshots(mine.id) })
          .then(function (rows) {
            check('a snapshot taken by hand is given the name you type', function () {
              var named = rows.filter(function (r) { return r.title === 'before the rewrite' })[0]
              return ok(!!named && named.reason === 'saved by hand' && named.code === 'worth marking',
                named ? 'named ' + JSON.stringify(named.title) + ', holding ' +
                  JSON.stringify(named.code) : 'no named snapshot: ' +
                  rows.map(function (r) { return r.reason + '/' + r.title }).join(', '))
            })
            var count = rows.length
            // naming the same state again renames it rather than duplicating
            window.prompt = function () { return 'renamed' }
            return snapshotWithTitle()
              .then(function () { return listSnapshots(mine.id) })
              .then(function (after) {
                check('naming a state that is already saved renames it, it does not copy it', function () {
                  return ok(after.length === count && after[0].title === 'renamed',
                    after.length + ' snapshots (was ' + count + '), newest named ' +
                    JSON.stringify(after[0].title))
                })
                // cancelling the prompt takes nothing at all
                window.prompt = function () { return null }
                setPaneText('main', 'not worth marking')
                return snapshotWithTitle()
              })
              .then(function () { return listSnapshots(mine.id) })
              .then(function (after) {
                check('cancelling the name takes no snapshot', function () {
                  return ok(after.length === count, after.length + ' snapshots, still ' + count)
                })
                window.prompt = realPrompt
              })
          })
      })
      .then(function () {
        // the cross on a row deletes just that one, and does not restore it
        return refreshHistory()
      })
      .then(function () {
        var before = contentOf('main')
        var rows = getsAll('#historyList [data-snapshot]')
        var doomed = rows[1].getAttribute('data-snapshot')
        var crosses = getsAll('#historyList [data-delete-snapshot]')
        var realConfirm2 = window.confirm
        window.confirm = function () { return true }
        crosses[1].click()
        return waitFor(function () {
          return getsAll('#historyList [data-snapshot]').length === rows.length - 1
        }, 4000).then(function (gone) {
          check('the cross deletes one snapshot without restoring it', function () {
            return ok(gone && contentOf('main') === before &&
              !Array.prototype.some.call(getsAll('#historyList [data-snapshot]'), function (r) {
                return r.getAttribute('data-snapshot') === doomed
              }),
              'rows left ' + getsAll('#historyList [data-snapshot]').length + ' of ' + rows.length +
              ', the pane still holds ' + JSON.stringify(contentOf('main')))
          })
          window.confirm = realConfirm2
        })
      })
      .then(function () {
        // clear history empties this project and leaves the others alone
        var other = makeProject({ name: 'not this one', code: 'keep me' })
        var realConfirm3 = window.confirm
        window.confirm = function () { return true }
        return saveProject(other)
          .then(function () { return takeSnapshot(other, 'idle') })
          .then(function () { return clearHistory() })
          .then(function () {
            return Promise.all([listSnapshots(mine.id), listSnapshots(other.id)])
          })
          .then(function (both) {
            check('clear history empties this project and nobody else', function () {
              return ok(both[0].length === 0 && both[1].length === 1,
                'this project has ' + both[0].length + ', the other still has ' + both[1].length)
            })
            window.confirm = realConfirm3
            return deleteProject(other.id).then(function () { return dropSnapshotsFor(other.id) })
          })
      })
      .then(function () {
        // the pruning rule on its own: sixty snapshots over a fortnight
        var now = Date.now()
        var rows = []
        for (var i = 0; i < 60; i++) {
          // the first twenty within the hour, the rest spread back over 14 days
          var takenAt = i < 20 ? now - i * 60 * 1000 : now - (i - 19) * 6 * 60 * 60 * 1000
          rows.push({ id: 'x' + i, takenAt: takenAt })
        }
        var keep = chooseKept(rows, now)
        var ids = keep.map(function (r) { return r.id })
        var newestTen = rows.slice(0, 10).every(function (r) { return ids.indexOf(r.id) > -1 })
        check('old snapshots are thinned out and the count is capped', function () {
          return ok(keep.length <= 50 && keep.length < rows.length && newestTen,
            'kept ' + keep.length + ' of ' + rows.length +
            ', the newest ten all kept=' + newestTen)
        })
      })
      .then(function () {
        // deleting a project takes its history with it
        var doomed = mine.id
        window.confirm = function () { return true }
        return removeProject()
          .then(function () { return listSnapshots(doomed) })
          .then(function (left) {
            check('deleting a project leaves no snapshots behind', function () {
              return ok(left.length === 0, left.length + ' snapshots still stored')
            })
            window.confirm = realConfirm
          })
      })
      .then(function () {
        SNAPSHOT_IDLE_MS = realIdle
        return switchProject(home.id)
      })
  }

  // ----------------------------------------------------------------- diff
  // The diff editor is the only thing here that creates models it then has to
  // throw away, so most of this is about what is left behind afterwards.

  // Null until the worker has answered; [] once it has and there is nothing
  // to report. So "no changes" and "not computed yet" are distinguishable,
  // which is the whole reason these checks wait rather than look once.
  function diffChanges() {
    if (!diffEditor || typeof diffEditor.getLineChanges !== 'function') return null
    return diffEditor.getLineChanges() || null
  }

  function waitForDiff() {
    return waitFor(function () { return diffChanges() !== null }, 8000)
  }

  function diffChecks() {
    var home = project
    var realConfirm = window.confirm
    var mine = makeProject({
      name: 'diffed',
      code: 'one\ntwo\nthree\nfour\nfive\nsix\nseven',
      css: 'a { color: red }',
      js: '// unchanged',
    })
    var baseline = 0
    var taken = null

    return saveProject(mine)
      .then(function () { return openRecord(mine) })
      .then(function () {
        // an explicit starting point: the split open, showing its own editor,
        // so what closing the diff restores is not whatever ran before this
        splitMenu('html')
        return snapshotNow('saved by hand', 'the version to compare against')
      })
      .then(function (row) {
        taken = row
        if (!row) {
          check('the diff had a snapshot to compare against', function () {
            return ok(false, 'no snapshot was taken')
          })
          return null
        }
        // Every pane's own model first, so the baseline is the page at rest.
        // The diff borrows those models rather than copying them, and one of
        // them being created by the first comparison would look like a leak.
        TAB_IDS.forEach(function (id) { TABS[id].ensure() })
        baseline = monaco.editor.getModels().length
        // Line 2 edited, line 5 deleted, a line added at the end: the three
        // kinds of change the view has to tell apart. They are spaced out on
        // purpose - monaco reports adjacent edits as a single block, so
        // changes sitting next to each other would count as one.
        setPaneText('main', 'one\ntwo changed\nthree\nfour\nsix\nseven\neight')
        return openDiff(row.id).then(waitForDiff)
      })
      .then(function () {
        if (!taken) return null
        var changes = diffChanges() || []
        check('the diff is the snapshot against what is open, not a copy of either', function () {
          var models = diffEditor.getModel() || {}
          var original = models.original && models.original.getValue()
          var modified = models.modified && models.modified.getValue()
          return ok(original === 'one\ntwo\nthree\nfour\nfive\nsix\nseven' && modified === contentOf('main'),
            'the snapshot side holds ' + JSON.stringify(String(original).slice(0, 24)) +
            ', the live side ' + JSON.stringify(String(modified).slice(0, 24)))
        })
        check('an edit, a deletion and an addition are each reported as such', function () {
          // a pure addition has nothing on the snapshot side, a pure deletion
          // nothing on the live side, and an edit has lines on both
          var kind = function (c) {
            if (c.originalEndLineNumber === 0) return 'added'
            if (c.modifiedEndLineNumber === 0) return 'deleted'
            return 'edited'
          }
          var kinds = changes.map(kind).sort().join(',')
          return ok(kinds === 'added,deleted,edited',
            changes.length + ' changes: ' + (kinds || 'none') + ' (wanted one of each)')
        })
        check('additions and deletions both reach the screen', function () {
          var inserted = getsAll('#diffBody .line-insert').length
          var deleted = getsAll('#diffBody .line-delete').length
          return ok(!!gets('#diffBody .monaco-diff-editor') && (inserted + deleted) > 0,
            inserted + ' inserted rows and ' + deleted + ' deleted rows drawn')
        })
        check('neither side of the diff can be typed into', function () {
          // the live model is the pane's own, so an editable modified side
          // would let a look at the past quietly become an edit of the present
          var readOnly = function (ed) { return ed.getOption(monaco.editor.EditorOption.readOnly) }
          return ok(readOnly(diffEditor.getOriginalEditor()) &&
            readOnly(diffEditor.getModifiedEditor()),
            'snapshot side readOnly=' + readOnly(diffEditor.getOriginalEditor()) +
            ', live side readOnly=' + readOnly(diffEditor.getModifiedEditor()))
        })
        check('the diff is drawn in the active theme, not a default one', function () {
          var pane = gets('#diffBody .monaco-editor-background') || gets('#diffBody .monaco-editor')
          var mine2 = pane ? getComputedStyle(pane).backgroundColor : 'no diff pane'
          return ok(mine2 === editorBackground(), 'the diff is ' + mine2 +
            ', the editor is ' + editorBackground())
        })
        // a file that did not change must read as unchanged, not as broken
        showDiffFile('css')
        return waitForDiff()
      })
      .then(function () {
        if (!taken) return null
        check('a file that did not change shows no differences', function () {
          var changes = diffChanges()
          var models = diffEditor.getModel() || {}
          return ok(!!changes && changes.length === 0 &&
            models.original.getValue() === 'a { color: red }',
            'changes=' + (changes && changes.length) + ', both sides hold ' +
            JSON.stringify(models.original && models.original.getValue()))
        })
        // the live side is the pane's own model, and closing must not take it
        var livePane = cssEditor && cssEditor.getModel()
        closeDiff()
        check('closing the diff leaves the pane it was comparing alone', function () {
          return ok(!!livePane && !livePane.isDisposed() && contentOf('css') === 'a { color: red }',
            'the css model is ' + (livePane && livePane.isDisposed() ? 'DISPOSED' : 'alive') +
            ' and holds ' + JSON.stringify(contentOf('css')))
        })
        check('closing the diff gives the split pane back as it was', function () {
          return ok(gets('#diffPane').style.display === 'none' &&
            gets('#splitEditor').style.display === 'block' &&
            gets('#splitContainer').style.display === 'block' &&
            quickEdit.split === true && quickEdit.splitLang === 'html',
            'diff pane display=' + JSON.stringify(gets('#diffPane').style.display) +
            ', split editor display=' + JSON.stringify(gets('#splitEditor').style.display) +
            ', split open=' + quickEdit.split + ' showing ' + JSON.stringify(quickEdit.splitLang))
        })
        return null
      })
      .then(function () {
        if (!taken) return null
        // Ten rounds. Nothing else in this project makes a throwaway model, so
        // a missing dispose would go unnoticed until the tab was slow.
        var round = function (left) {
          if (left === 0) return Promise.resolve()
          return openDiff(taken.id)
            .then(waitForDiff)
            .then(function () {
              showDiffFile('js')
              return waitForDiff()
            })
            .then(function () { closeDiff(); return round(left - 1) })
        }
        return round(10).then(function () {
          check('opening and closing the diff ten times leaves no models behind', function () {
            var now = monaco.editor.getModels().length
            return ok(now === baseline, now + ' models, started from ' + baseline)
          })
        })
      })
      .then(function () {
        if (!taken) return null
        // opened from a closed split, closing it should close the split again
        singleEditor()
        return openDiff(taken.id).then(waitForDiff).then(function () {
          var opened = gets('#splitContainer').style.display === 'block'
          closeDiff()
          check('a diff opened from a single editor puts the single editor back', function () {
            return ok(opened && gets('#splitContainer').style.display === 'none' &&
              quickEdit.split === false,
              'the split opened=' + opened + ', and afterwards display=' +
              JSON.stringify(gets('#splitContainer').style.display) +
              ' split=' + quickEdit.split)
          })
        })
      })
      .then(function () {
        if (!taken) return null
        // picking a split tab is a decision about the pane; the diff yields
        return openDiff(taken.id).then(waitForDiff).then(function () {
          splitMenu('css')
          check('picking a split tab closes the diff instead of hiding behind it', function () {
            return ok(!diffShowing() && gets('#diffPane').style.display === 'none' &&
              gets('#splitEditor').style.display !== 'none',
              'diff still open=' + diffShowing() + ', diff pane display=' +
              JSON.stringify(gets('#diffPane').style.display))
          })
        })
      })
      .then(function () {
        if (!taken) return null
        // Through the menu, not by calling openDiff. The glyph sits inside the
        // row, and a click that falls through to the row restores instead of
        // comparing - overwriting the very work you wanted to compare against.
        // confirm says yes throughout, so a restore cannot be excused by the
        // dialog having turned it down.
        closeDiff()
        return refreshHistory().then(function () {
          var before = contentOf('main')
          var glyph = gets('#historyList [data-diff-snapshot="' + taken.id + '"]')
          window.confirm = function () { return true }
          if (glyph) glyph.click()
          return waitFor(function () { return diffShowing() }, 5000)
            .then(waitForDiff)
            .then(function () {
              check('the compare glyph compares instead of restoring', function () {
                return ok(!!glyph && diffShowing() && contentOf('main') === before,
                  'glyph found=' + !!glyph + ', diff open=' + diffShowing() +
                  ', the pane still holds ' + JSON.stringify(String(contentOf('main')).slice(0, 24)))
              })
              window.confirm = realConfirm
            })
        })
      })
      .then(function () {
        if (!taken) return null
        // Restoring from the bar is the point of having looked: decide, then
        // act, without going back to a list of timestamps.
        window.confirm = function () { return true }
        gets('#diffRestore').click()
        return waitFor(function () { return contentOf('main') === taken.code }, 5000)
          .then(waitForDiff)
          .then(function () {
            var changes = diffChanges()
            check('restoring from the diff bar puts the snapshot back and says so', function () {
              return ok(contentOf('main') === taken.code && !!changes && changes.length === 0,
                'the pane holds ' + JSON.stringify(String(contentOf('main')).slice(0, 24)) +
                ' and the diff now reports ' + (changes ? changes.length : 'null') + ' changes')
            })
            window.confirm = realConfirm
          })
      })
      .then(function () {
        if (!taken) return null
        // deleting the snapshot on screen must not leave it on screen
        return openDiff(taken.id).then(waitForDiff).then(function () {
          window.confirm = function () { return true }
          return removeSnapshot(taken.id).then(function () {
            check('deleting the snapshot being compared closes the comparison', function () {
              return ok(!diffShowing() && gets('#diffPane').style.display === 'none',
                'diff still open=' + diffShowing())
            })
            window.confirm = realConfirm
          })
        })
      })
      .then(function () {
        window.confirm = function () { return true }
        return removeProject()
          .then(function () { window.confirm = realConfirm })
          .then(function () { return switchProject(home.id) })
      })
  }

  // ----------------------------------------------------------- typescript
  // The js pane has two flavours. Most of what matters here is what does NOT
  // happen in the plain javascript one, and whether a line number survives
  // having the types taken out from under it.

  function tsChecks() {
    // The decoder, on its own. A compiled snippet only ever walks forwards
    // through its source, so nothing above reaches the sign bit - and dropping
    // it went unnoticed until this was here.
    check('the source map decoder reads deltas in both directions', function () {
      // fields are deltas that carry across lines: 0, then +1, then -1
      var back = decodeLineMap('AAAA;AACA;AADA')
      // and one that needs a second character to hold it: +16
      var far = decodeLineMap('AAAA;AAgBA')
      return ok(String(back) === '0,1,0' && String(far) === '0,16',
        '0/+1/-1 gave [' + back + '] (want 0,1,0), and +16 gave [' + far + '] (want 0,16)')
    })

    var home = project
    var mine = makeProject({ name: 'typed', code: '<h1>ts</h1>', css: '', js: '' })

    return saveProject(mine)
      .then(function () { return openRecord(mine) })
      .then(function () {
        // Deliberately TypeScript source in a javascript project: it has to
        // come back untouched, which is the whole of the promise that existing
        // projects pay nothing for this feature.
        setJsLang('javascript')
        localStorage.removeItem('quickcodeCompiled')
        var typed = 'const x: number = 1'
        return jsForPreview(typed).then(function (out) {
          check('a plain javascript project is never compiled', function () {
            return ok(out === typed && !localStorage.getItem('quickcodeCompiled'),
              'came back ' + JSON.stringify(out) + ', anything published=' +
              !!localStorage.getItem('quickcodeCompiled'))
          })
        })
      })
      .then(function () {
        setJsLang('typescript')
        return jsForPreview('interface P { n: number }\nconst p: P = { n: 41 }\nconsole.log(p.n + 1)\n')
      })
      .then(function (js) {
        check('typescript compiles, with the types taken out', function () {
          return ok(js.indexOf('interface') === -1 && js.indexOf(': P') === -1 &&
            js.indexOf('console.log(p.n + 1)') > -1,
            JSON.stringify(js))
        })
        check('the compiled output does not ask the preview for a map file', function () {
          // the emit names one that is never written, and the name is a model
          // this file threw away
          return ok(js.indexOf('sourceMappingURL') === -1,
            'tail is ' + JSON.stringify(js.slice(-40)))
        })
        check('the compiled output is left where the popped out preview can find it', function () {
          var saved
          try { saved = JSON.parse(localStorage.getItem('quickcodeCompiled')) } catch (err) { saved = null }
          return ok(!!saved && saved.id === project.id && saved.js === js,
            saved ? 'published for ' + saved.id + ' (open project is ' + project.id + ')'
                  : 'nothing was published')
        })
        clearConsole()
        return jsForPreview('const n: number = "no"\nconsole.log("ran anyway")\n')
      })
      .then(function (js) {
        check('a type error is reported on its own line, and the javascript still runs', function () {
          var row = rowSaying('Type error')
          return ok(!!row && whereOf(row) === 'ts:1' && js.indexOf('ran anyway') > -1,
            row ? 'said ' + JSON.stringify(row.textContent) + ' at ' + whereOf(row) + ' (want ts:1)'
                : 'nothing was reported: ' + consoleRowsText().join(' | '))
        })
        return jsForPreview('const a: number = "no"\nconst b: number = "also no"\n')
      })
      .then(function () {
        check('a new report replaces the last one instead of stacking up', function () {
          var rows = getsAll('#consoleOut .log-compile')
          return ok(rows.length === 2, rows.length + ' compile rows, wanted 2 (one per error)')
        })
        clearConsole()
        return jsForPreview('function ( {\n')
      })
      .then(function (js) {
        check('a syntax error runs nothing rather than running the last good output', function () {
          var row = rowSaying('Will not compile')
          return ok(js === '' && !!row,
            'emitted ' + JSON.stringify(js) + '; said ' +
            (row ? JSON.stringify(row.textContent) : 'nothing'))
        })
      })
      .then(function () {
        // Two type-only lines above the throw. The generated javascript has it
        // on line 1; the editor has it on line 3. Without the source map being
        // read this reports ts:1, which is the kind of confidently wrong number
        // preview.js exists to avoid.
        gets('#jsCheck').checked = true
        saveSettings({ js: true, css: true })
        setPaneText('main', '<h1>ts</h1>')
        setPaneText('js', 'interface P { n: number }\ntype Q = string\nthrow new Error("from ts")\n')
        clearConsole()
        splitMenu('preview')
        return waitFor(function () { return !!rowSaying('from ts') }, 15000)
      })
      .then(function (spoke) {
        check('a runtime error is reported against the typescript line, not the compiled one', function () {
          var row = rowSaying('from ts')
          return ok(spoke && !!row && whereOf(row) === 'ts:3',
            row ? 'reported at ' + whereOf(row) + ' (want ts:3)'
                : 'nothing came back: ' + consoleRowsText().join(' | '))
        })
      })
      .then(function () {
        // the model is retargeted rather than rebuilt, so nothing is lost
        splitMenu('javascript')
        makeActive('js')
        setPaneText('js', 'const kept: number = 1')
        setJsLang('javascript')
        check('switching flavour keeps the text and retargets the highlighting', function () {
          var ed = TABS.js.get()
          return ok(contentOf('js') === 'const kept: number = 1' &&
            ed.getModel().getLanguageId() === 'javascript' &&
            splitEditor.getModel().getLanguageId() === 'javascript',
            'text=' + JSON.stringify(contentOf('js')) + ', pane is ' +
            ed.getModel().getLanguageId() + ', split pane is ' +
            splitEditor.getModel().getLanguageId())
        })
      })
      .then(function () {
        // the badge sits inside the js tab; clicking it must not also move tabs
        makeActive('main')
        var badge = gets('#jsLang')
        badge.click()
        check('the flavour badge switches flavour without switching tabs', function () {
          return ok(quickEdit.jsLang === 'typescript' && quickEdit.tab === 'main' &&
            badge.textContent === 'ts' && badge.classList.contains('on'),
            'flavour=' + quickEdit.jsLang + ', tab=' + quickEdit.tab +
            ', badge reads ' + JSON.stringify(badge.textContent))
        })
      })
      .then(function () {
        // A record written before the setting existed has no opinion about it,
        // and must not inherit the open project's - which is typescript here.
        var legacy = makeProject({ name: 'before typescript', js: 'var a = 1' })
        delete legacy.settings.jsLang
        return saveProject(legacy)
          .then(function () { return switchProject(legacy.id) })
          .then(function () {
            check('a project saved before the setting existed does not inherit a flavour', function () {
              return ok(quickEdit.jsLang === 'javascript' &&
                gets('#jsLang').textContent === 'js',
                'flavour=' + quickEdit.jsLang + ', badge reads ' +
                JSON.stringify(gets('#jsLang').textContent))
            })
            return switchProject(mine.id)
          })
          .then(function () {
            check('the flavour belongs to the project and comes back with it', function () {
              return ok(quickEdit.jsLang === 'typescript' &&
                TABS.js.get().getModel().getLanguageId() === 'typescript',
                'flavour=' + quickEdit.jsLang + ', pane is ' +
                TABS.js.get().getModel().getLanguageId())
            })
            return deleteProject(legacy.id)
          })
      })
      .then(function () {
        var realConfirm = window.confirm
        window.confirm = function () { return true }
        return removeProject()
          .then(function () { window.confirm = realConfirm })
          .then(function () { return switchProject(home.id) })
      })
  }

  // --------------------------------------------------------------- sharing
  // The values here must match SHARED in run.js: that case opens a link this
  // browser did not build, which is the only way to prove the format is really
  // deflate-raw and not something chrome only round-trips with itself.
  var SHARED = {
    name: 'Fizz buzz',
    code: '<h1>hej världen 😀</h1>',
    css: 'h1 { color: rebeccapurple }',
    js: 'console.log("delad åäö")',
  }

  function encodeRaw(payload) {
    var stream = new Blob([JSON.stringify(payload)]).stream()
      .pipeThrough(new CompressionStream('deflate-raw'))
    return new Response(stream).arrayBuffer().then(function (buf) {
      return bytesToBase64Url(new Uint8Array(buf))
    })
  }

  function shareChecks() {
    var home = project
    var awkward = makeProject({
      name: 'awkward',
      code: '<p>åäö 🚀 你好</p>\n\ttabbed\r\nand "quoted"',
      css: '.a::after { content: "→" }',
      js: 'const é = () => "🎉"',
    })
    awkward.settings.lang = 'html'
    awkward.settings.css = true
    awkward.settings.js = true

    return encodeShare(awkward)
      .then(decodeShare)
      .then(function (back) {
        check('a share link round-trips byte for byte, emoji and all', function () {
          return ok(back.code === awkward.code && back.css === awkward.css &&
            back.js === awkward.js && back.lang === 'html' && back.cssOn === true &&
            back.jsOn === true && back.name === 'awkward',
            'code matches=' + (back.code === awkward.code) +
            ' css=' + (back.css === awkward.css) + ' js=' + (back.js === awkward.js) +
            ' toggles=' + back.cssOn + '/' + back.jsOn)
        })
        return encodeShare(awkward)
      })
      .then(function (fragment) {
        check('the link is a url fragment and nothing else', function () {
          var url = shareUrl(fragment)
          return ok(url.indexOf('#s=') > -1 && /^[A-Za-z0-9_-]+$/.test(fragment) &&
            url.indexOf(location.origin) === 0,
            fragment.length + ' chars, url ' + url.length + ' long, ' +
            (url.length / 1024).toFixed(1) + ' KB')
        })
        // Put the link in the address bar first, so clearing it is actually
        // exercised rather than passing because there was nothing there.
        location.hash = '#s=' + fragment
        // the boot path, called directly: it is only ever reached before the
        // editors exist, so nothing here looks at the screen
        return importShared(fragment)
      })
      .then(function () {
        var imported = project
        return getProject(home.id).then(function (untouched) {
          check('opening a shared link leaves the project that was open alone', function () {
            return ok(imported.id !== home.id && !!untouched &&
              untouched.code === home.code && shareProblem === '',
              'imported as a new record=' + (imported.id !== home.id) +
              ', the old one still holds ' + JSON.stringify(String(untouched && untouched.code).slice(0, 30)))
          })
          check('the fragment is cleared so a reload does not import it twice', function () {
            return ok(location.hash === '', JSON.stringify(location.hash))
          })
        })
      })
      .then(function () {
        return importShared('this-is-not-a-link!!')
      })
      .then(function () {
        check('a corrupt link is refused rather than throwing', function () {
          return ok(shareProblem !== '' && window.__errors.length === 0,
            'reason given: ' + JSON.stringify(shareProblem) +
            '; uncaught: ' + (window.__errors.join(' | ') || 'none'))
        })
        shareProblem = ''
        return encodeRaw({ v: 99, code: 'from the future' }).then(importShared)
      })
      .then(function () {
        check('a link from another version is turned away with a reason', function () {
          return ok(shareProblem.indexOf('version') > -1, JSON.stringify(shareProblem))
        })
        shareProblem = ''
        return openRecord(home)
      })
      .then(function () {
        // the button itself. A headless run has no clipboard permission, so
        // this exercises the fallback path as well as the message.
        var row = gets('#share')
        var label = row.textContent
        gets('#save').click()
        var copiedTo = null
        var realWrite = navigator.clipboard && navigator.clipboard.writeText
        if (realWrite) {
          navigator.clipboard.writeText = function (text) { copiedTo = text; return Promise.resolve() }
        }
        row.click()
        return waitFor(function () { return row.textContent !== label }, 5000).then(function (spoke) {
          var shown = row.textContent
          var fallback = gets('#filename').value
          var link = copiedTo || fallback
          if (realWrite) navigator.clipboard.writeText = realWrite
          hideOverlay()
          check('the share button produces a link and says what it costs', function () {
            return ok(spoke && /#s=[A-Za-z0-9_-]+$/.test(link) && shown.indexOf('KB') > -1 &&
              shown.indexOf('anyone with it can read your code') > -1,
              'it said ' + JSON.stringify(shown) + '; link ends ' +
              JSON.stringify(String(link).slice(-12)))
          })
          row.textContent = label
        })
      })
  }

  // -------------------------------------------------------------- projects
  function projectChecks() {
    var realConfirm = window.confirm
    var home = project.id
    var alpha = makeProject({ name: 'alpha', code: '<h1>alpha</h1>', css: 'a { color: red }', js: '// alpha' })
    var beta = makeProject({ name: 'beta', code: '<h1>beta</h1>', css: 'b { color: blue }', js: '// beta' })
    beta.settings.tab = 'js'
    beta.settings.split = true
    beta.settings.splitLang = 'css'

    return saveProject(alpha)
      .then(function () { return saveProject(beta) })
      .then(function () { return switchProject(alpha.id) })
      .then(function () {
        check('switching projects loads its files into every pane', function () {
          return ok(project.id === alpha.id && contentOf('main') === '<h1>alpha</h1>' &&
            contentOf('css') === 'a { color: red }' && contentOf('js') === '// alpha' &&
            gets('#project').innerText === 'alpha',
            'open=' + project.name + ' main=' + JSON.stringify(contentOf('main')) +
            ' css=' + JSON.stringify(contentOf('css')) + ' js=' + JSON.stringify(contentOf('js')))
        })
        ensureMainEditor()
        editor.getModel().setValue('<h1>alpha edited</h1>')
        return switchProject(beta.id)
      })
      .then(function () {
        check('nothing bleeds from one project into the next', function () {
          return ok(contentOf('main') === '<h1>beta</h1>' && contentOf('css') === 'b { color: blue }' &&
            contentOf('js') === '// beta',
            'main=' + JSON.stringify(contentOf('main')) + ' css=' + JSON.stringify(contentOf('css')))
        })
        check('a project brings its own tab and split state with it', function () {
          return ok(quickEdit.tab === 'js' && gets('#js').classList.contains('active-tab') &&
            quickEdit.split === true && gets('#splitContainer').style.display === 'block',
            'tab=' + quickEdit.tab + ' split shown=' + (gets('#splitContainer').style.display === 'block'))
        })
        return switchProject(alpha.id)
      })
      .then(function () {
        check('an edit made before switching away is still there on the way back', function () {
          return ok(contentOf('main') === '<h1>alpha edited</h1>' && quickEdit.split === false,
            'main=' + JSON.stringify(contentOf('main')) + ' split=' + quickEdit.split)
        })
        return refreshProjects()
      })
      .then(function () {
        check('the picker lists every project and marks the open one', function () {
          var rows = getsAll('#projectList [data-project]')
          var names = Array.prototype.map.call(rows, function (r) { return r.textContent })
          var marked = Array.prototype.filter.call(rows, function (r) { return r.classList.contains('active-project') })
          return ok(rows.length >= 3 && names.indexOf('alpha') > -1 && names.indexOf('beta') > -1 &&
            marked.length === 1 && marked[0].textContent === 'alpha',
            names.join(', ') + ' | marked: ' + (marked[0] && marked[0].textContent))
        })
        return duplicateProject()
      })
      .then(function () {
        var copyId = project.id
        ensureMainEditor()
        editor.getModel().setValue('<h1>only in the copy</h1>')
        return switchProject(alpha.id).then(function () {
          check('a duplicate is a separate project, not a second view of one', function () {
            return ok(copyId !== alpha.id && contentOf('main') === '<h1>alpha edited</h1>',
              'copy id differs=' + (copyId !== alpha.id) +
              ', the original still holds ' + JSON.stringify(contentOf('main')))
          })
          return switchProject(copyId)
        })
      })
      .then(function () {
        window.confirm = function () { return true }
        var doomed = project.id
        return removeProject()
          .then(listProjects)
          .then(function (all) {
            check('deleting the open project removes it and opens another', function () {
              var ids = all.map(function (p) { return p.id })
              return ok(ids.indexOf(doomed) === -1 && !!project && project.id !== doomed && all.length > 0,
                'gone from the store=' + (ids.indexOf(doomed) === -1) +
                ', now open: ' + project.name + ', ' + all.length + ' left')
            })
          })
      })
      .then(function () {
        window.confirm = realConfirm
        return switchProject(home)
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

  // ------------------------------------------------------------ share (url)
  // This page was opened with a #s= fragment that run.js built with node's
  // zlib, so nothing in the browser has seen the payload before.
  if (CASE === 'share') {
    listProjects().then(function (all) {
      check('a link built outside the browser opens', function () {
        return ok(readStored('code') === '<h1>hej v\u00e4rlden \ud83d\ude00</h1>' &&
          readStored('css') === 'h1 { color: rebeccapurple }' &&
          readStored('js') === 'console.log("delad \u00e5\u00e4\u00f6")',
          'code=' + JSON.stringify(readStored('code')) +
          ' css=' + JSON.stringify(readStored('css')))
      })
      check('its language and preview toggles came with it', function () {
        return ok(quickEdit.lang === 'html' && quickEdit.css === true && quickEdit.js === false,
          'lang=' + quickEdit.lang + ' css=' + quickEdit.css + ' js=' + quickEdit.js)
      })
      check('it opened as a project of its own, beside the empty one', function () {
        var shared = all.filter(function (p) { return p.id === project.id })[0]
        var others = all.filter(function (p) { return p.id !== project.id })
        return ok(all.length === 2 && !!shared && /shared/.test(shared.name) &&
          others.length === 1 && others[0].code === '',
          all.map(function (p) { return p.name + ':' + p.code.length }).join(', '))
      })
      check('the editor shows it, and the link is gone from the address bar', function () {
        return ok(editor.getValue() === readStored('code') && location.hash === '' &&
          window.__errors.length === 0,
          'editor matches=' + (editor.getValue() === readStored('code')) +
          ' hash=' + JSON.stringify(location.hash) +
          '; errors: ' + (window.__errors.join(' | ') || 'none'))
      })
      report()
    })
    return
  }

  // ----------------------------------------------------- migration (reload)
  // Loads once over a pre-IndexedDB localStorage, then reloads: the migration
  // has to be idempotent, or the second load duplicates everything.
  if (CASE === 'migrate') {
    listProjects().then(function (all) {
      var first = all[0] || {}
      if (!sessionStorage.getItem('qc-phase')) {
        check('a pre-IndexedDB install becomes exactly one project', function () {
          return ok(all.length === 1,
            all.length + ' projects: ' + all.map(function (p) { return p.name }).join(', '))
        })
        check('its three files came across untouched', function () {
          return ok(first.code === '<h1>from the old store</h1>' &&
            first.css === 'h1 { color: rebeccapurple }' &&
            first.js === 'console.log("old")',
            'code=' + JSON.stringify(first.code) + ' css=' + JSON.stringify(first.css) +
            ' js=' + JSON.stringify(first.js))
        })
        check('the old localStorage keys are left in place as a safety net', function () {
          return ok(localStorage.getItem('code') === '<h1>from the old store</h1>',
            'the old code key is ' + (localStorage.getItem('code') === null ? 'gone' : 'still there'))
        })
        check('the per-project settings came across as well', function () {
          return ok(quickEdit.tab === 'css' && quickEdit.css === true && quickEdit.js === true,
            'tab=' + quickEdit.tab + ' css toggle=' + quickEdit.css + ' js toggle=' + quickEdit.js)
        })
        // the runner takes the first report as final, so phase one hands its
        // results to phase two rather than sending them
        sessionStorage.setItem('qc-phase', 'check')
        sessionStorage.setItem('qc-case', 'migrate')
        sessionStorage.setItem('qc-id', first.id || '')
        sessionStorage.setItem('qc-results', JSON.stringify(results))
        location.reload()
        return
      }

      results = JSON.parse(sessionStorage.getItem('qc-results') || '[]').concat(results)
      check('loading again does not migrate a second time', function () {
        return ok(all.length === 1 && first.id === sessionStorage.getItem('qc-id'),
          all.length + ' projects after the second load, same record=' +
          (first.id === sessionStorage.getItem('qc-id')))
      })
      check('the migrated content is still what it was', function () {
        return ok(readStored('code') === '<h1>from the old store</h1>' &&
          readStored('css') === 'h1 { color: rebeccapurple }',
          'code=' + JSON.stringify(readStored('code')))
      })

      // The other half of being idempotent, and the one that matters after
      // someone has been using it: the old keys are still on disk, so emptying
      // the store must not bring the deleted work back from the dead.
      //
      // The queued write is cancelled and the open record dropped first,
      // because otherwise a flush lands mid-delete and puts it straight back -
      // which is what a fresh load looks like anyway.
      cancelFlush()
      project = null
      Promise.all(all.map(function (p) { return deleteProject(p.id) }))
        .then(openWorkspace)
        .then(function (fresh) {
          check('deleting every project does not resurrect the old content', function () {
            return ok(fresh.code === '' && localStorage.getItem('code') !== null,
              'the new project came back holding ' + JSON.stringify(fresh.code) +
              ', old key still on disk=' + (localStorage.getItem('code') !== null))
          })
        }, function (err) {
          check('deleting every project does not resurrect the old content', function () {
            return ok(false, 'it threw: ' + err.message)
          })
        })
        .then(report)
      return
    })
    return
  }

  // ------------------------------------------------------- offline (reload)
  // The server stops answering for everything but the suite's own endpoints,
  // then the page reloads: the whole app now has to come out of the cache.
  if (CASE === 'offline') {
    if (!sessionStorage.getItem('qc-phase')) {
      // Patient on purpose: the worker does not activate until it has
      // precached about 2.5MB from two CDNs, so this case is as slow as the
      // network is on the day.
      navigator.serviceWorker.ready
        .then(function () { return waitFor(function () { return !!navigator.serviceWorker.controller }, 60000) })
        .then(function (controlled) {
          if (!controlled) {
            check('the service worker took control before the network went away', function () {
              return ok(false, 'no controller after 60s')
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
      // The reason the plan's esbuild-wasm was turned down: the compiler is
      // monaco's own, so there is nothing left to download by the time the
      // network is gone. This is where that claim is either true or it is not.
      configureTypeScript()
      saveSettings({ jsLang: 'typescript' })
      return jsForPreview('interface P { n: number }\nconst p: P = { n: 7 }\nconsole.log(p.n)\n')
        .then(function (js) {
          check('typescript still compiles with the network gone', function () {
            return ok(js.indexOf('interface') === -1 && js.indexOf('console.log(p.n)') > -1,
              JSON.stringify(js))
          })
        }, function (err) {
          check('typescript still compiles with the network gone', function () {
            return ok(false, 'it could not: ' + String(err && err.message || err))
          })
        })
        .then(report)
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
      // a real file handle, to prove the pane's file comes back with the project
      navigator.storage.getDirectory()
        .then(function (dir) { return dir.getFileHandle('persisted.txt', { create: true }) })
        .then(function (handle) { return attachHandle('main', handle) })
        .catch(function () { /* no opfs here; the check after the reload says so */ })
        // the write is asynchronous now, so wait for it rather than relying on
        // the crash net to catch what did not land
        .then(flushStorage)
        .then(function () {
          sessionStorage.setItem('qc-phase', 'check')
          location.reload()        // an in-flight theme fetch must not reset the stored theme
        })
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
    check('the file a pane was editing comes back with the project', function () {
      var handle = fileHandles.main
      if (!handle) return ok(false, 'the main pane came back with no file attached')
      makeActive('main')
      return ok(handle.name === 'persisted.txt' && document.title === 'persisted.txt - QuickCode' &&
        !unsaved.main,
        'handle=' + handle.name + ', title=' + JSON.stringify(document.title) +
        ', marked unsaved=' + unsaved.main)
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
      // filled in by the asynchronous read below, before this runs
      return ok(window.__survived === true, window.__survivedDetail)
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
  // The hostile snippet lives in a project record now, so the probe seeds it:
  // seed.js has to stay synchronous and IndexedDB is not.
  function seedPreviewProject() {
    var hostile = makeProject({
      name: 'preview',
      code: '<h1>my important work</h1><script>' +
        'parent.postMessage("SNIPPET_RAN","*");' +
        'try { localStorage.clear(); parent.postMessage("STORAGE_WRITABLE","*") }' +
        'catch (e) { parent.postMessage("STORAGE_BLOCKED:" + e.name, "*") }' +
        '<\/script>',
      css: 'body{color:teal}',
      js: '// a library the user wrote',
    })
    window.__seededId = hostile.id
    return saveProject(hostile)
      .then(function () { setActiveId(hostile.id) })
      .then(refresh)      // app.html's own reader, and the one that wins
  }

  function previewSurvived() {
    return getProject(window.__seededId).then(function (saved) {
      window.__survived = !!saved && saved.css === 'body{color:teal}' &&
        saved.js === '// a library the user wrote' &&
        String(saved.code).indexOf('my important work') > -1 &&
        localStorage.getItem('quickEdit') !== null
      window.__survivedDetail = 'record ' + (saved ? 'intact, css=' + JSON.stringify(saved.css) : 'GONE') +
        ', settings kept=' + (localStorage.getItem('quickEdit') !== null)
    }, function (err) {
      window.__survived = false
      window.__survivedDetail = 'could not read the project back: ' + err.message
    })
  }

  if (CASE === 'preview-safe') {
    seedPreviewProject().catch(function (err) {
      // a rejection here would otherwise hang the case until it times out,
      // reporting nothing about why
      check('the preview project could be seeded', function () { return ok(false, String(err)) })
      report()
      throw err
    }).then(function () {
      // Generous: the sandboxed document has to be created, parsed and run
      // after the record is written, and this is the fifth browser the suite
      // has started. A tight budget here reads as "the snippet never ran".
      // Wait for the snippet's last word, not just any message: the preview
      // prelude posts its own (console output and errors), and stopping at the
      // first one would report before the snippet had finished speaking.
      var said = function (prefix) {
        return window.__messages.some(function (m) { return String(m).indexOf(prefix) === 0 })
      }
      var waited = 0
      var poll = setInterval(function () {
        waited += 100
        if (said('STORAGE_') || waited >= 15000) {
          clearInterval(poll)
          previewSurvived().then(function () {
            runPreviewChecks()
            report()
          })
        }
      }, 100)
    })
  } else if (CASE === 'core') {
    // formatting has to fetch prettier, so the core case reports once it settles
    storeChecks().then(emmetChecks).then(themeChecks).then(formattingChecks).then(themeFallbackChecks).then(fileHandleChecks)
      .then(pwaChecks).then(projectChecks).then(shareChecks).then(previewChecks).then(historyChecks).then(diffChecks).then(tsChecks)
      .then(report, function (err) {
      check('the core chain ran to the end', function () {
        return ok(false, String(err) + ' | ' + String(err && err.stack).slice(0, 400))
      })
      report()
    })
  } else {
    report()
  }
})()

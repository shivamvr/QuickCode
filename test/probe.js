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
  }, 150000)

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
  // --------------------------------------------------------------- the dialog
  // prompt(), confirm() and alert() are gone, so what replaced them has to be
  // at least as dependable as they were. These drive the REAL dialog - opening
  // it, typing in it, pressing keys at it - rather than the seam the other
  // blocks replace. They run first in the chain so that no other block's stub
  // can have leaked into them.

  function dialogChecks() {
    var tick = function () { return new Promise(function (r) { setTimeout(r, 0) }) }
    var showing = function () { return gets('#dialog').classList.contains('showing') }
    var heading = function () { return gets('#dialogTitle').textContent }
    var detail = function () { return gets('#dialogDetail').textContent }
    var click = function (selector) {
      gets(selector).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    }
    var press = function (key, shift, ctrl) {
      var target = document.activeElement || document.body
      target.dispatchEvent(new KeyboardEvent('keydown', {
        key: key, shiftKey: !!shift, ctrlKey: !!ctrl, bubbles: true, cancelable: true,
      }))
    }
    // somewhere for the keyboard to have been, so "focus went back where it
    // came from" is something that can be asserted rather than assumed
    var parked = document.createElement('input')

    return Promise.resolve()
      .then(function () {
        check('nothing is on screen until something asks', function () {
          return ok(gets('#dialog') && !showing(),
            gets('#dialog') ? 'showing=' + showing() : 'there is no #dialog in the document')
        })
        check('it is announced as a dialog, not just drawn as one', function () {
          var root = gets('#dialog')
          var labelled = document.getElementById(root.getAttribute('aria-labelledby'))
          return ok(root.getAttribute('role') === 'dialog' &&
            root.getAttribute('aria-modal') === 'true' &&
            labelled === gets('#dialogTitle'),
            'role=' + root.getAttribute('role') + ' aria-modal=' + root.getAttribute('aria-modal') +
            ' labelledby->' + (labelled ? labelled.id : 'nothing'))
        })
      })

      // ---------------------------------------------------- asking for text
      .then(function () {
        var answer = askText('Name this snapshot?\n\nThe one you type is the one it keeps.', 'Untitled')
        return tick().then(function () {
          check('a question opens it, split into a heading and the rest', function () {
            return ok(showing() && heading() === 'Name this snapshot?' &&
              detail() === 'The one you type is the one it keeps.' && !gets('#dialogDetail').hidden,
              '[' + heading() + '] [' + detail() + ']')
          })
          check('the suggested answer is in the field, selected and ready to replace', function () {
            var input = gets('#dialogInput')
            return ok(!input.hidden && input.value === 'Untitled' &&
              document.activeElement === input &&
              input.selectionStart === 0 && input.selectionEnd === 'Untitled'.length,
              'value=' + input.value + ' focused=' + (document.activeElement === input) +
              ' selected=' + input.selectionStart + '-' + input.selectionEnd)
          })
          gets('#dialogInput').value = 'typed by hand'
          press('Enter')
          return answer
        }).then(function (value) {
          check('enter answers with what was typed, and closes it', function () {
            return ok(value === 'typed by hand' && !showing(),
              'answer=' + JSON.stringify(value) + ' still showing=' + showing())
          })
        })
      })

      .then(function () {
        var answer = askText('Rename to?', 'old name')
        return tick().then(function () {
          press('Escape')
          return answer
        }).then(function (value) {
          check('escape cancels, and cancelling is null rather than empty', function () {
            // '' would be a rename to nothing; null is what every caller tests for
            return ok(value === null && !showing(),
              'answer=' + JSON.stringify(value) + ' still showing=' + showing())
          })
        })
      })

      .then(function () {
        var answer = askText('Rename to?', 'old name')
        return tick().then(function () {
          click('#dialogCancel')
          return answer
        }).then(function (value) {
          check('the cancel button means the same as escape', function () {
            return ok(value === null, 'answer=' + JSON.stringify(value))
          })
        })
      })

      // ------------------------------------------------- asking yes or no
      .then(function () {
        var answer = askYesNo('Delete "notes"?\n\nThis cannot be undone.')
        return tick().then(function () {
          check('a yes/no question has no field to fill in', function () {
            return ok(showing() && gets('#dialogInput').hidden &&
              gets('#dialogOk').textContent === 'Yes' &&
              document.activeElement === gets('#dialogOk'),
              'field hidden=' + gets('#dialogInput').hidden +
              ' ok says ' + gets('#dialogOk').textContent +
              ' focused=' + (document.activeElement === gets('#dialogOk') ? 'ok' : 'elsewhere'))
          })
          click('#dialogOk')
          return answer
        }).then(function (value) {
          check('yes is true', function () { return ok(value === true, 'answer=' + value) })
        })
      })

      .then(function () {
        var answer = askYesNo('Delete everything?')
        return tick().then(function () {
          click('#dialogCancel')
          return answer
        }).then(function (value) {
          check('no is false', function () { return ok(value === false, 'answer=' + value) })
        })
      })

      .then(function () {
        var answer = askYesNo('Delete everything?')
        return tick().then(function () {
          press('Escape')
          return answer
        }).then(function (value) {
          // the safe reading of a destructive question is always no
          check('escape on a yes/no is no, never yes', function () {
            return ok(value === false, 'answer=' + value)
          })
        })
      })

      // --------------------------------------------------- telling someone
      .then(function () {
        var answer = sayProblem('Could not save "notes.js".\n\nThe file was moved.')
        return tick().then(function () {
          check('a message you can only acknowledge offers no cancel', function () {
            return ok(showing() && gets('#dialogCancel').hidden && gets('#dialogInput').hidden &&
              gets('#dialogOk').textContent === 'OK' && detail() === 'The file was moved.',
              'cancel hidden=' + gets('#dialogCancel').hidden +
              ' ok says ' + gets('#dialogOk').textContent)
          })
          click('#dialogOk')
          return answer
        }).then(function () {
          check('acknowledging it closes it', function () {
            return ok(!showing(), 'still showing=' + showing())
          })
        })
      })

      // ------------------------------------------------- focus and the page
      .then(function () {
        document.body.appendChild(parked)
        parked.focus()
        var wasOn = document.activeElement
        var answer = askYesNo('Anything?')
        return tick().then(function () {
          var inside = gets('#dialog').contains(document.activeElement)
          var editorOut = gets('#editor').inert === true
          var dialogIn = gets('#dialog').inert !== true
          click('#dialogOk')
          return answer.then(function () {
            return { inside: inside, editorOut: editorOut, dialogIn: dialogIn, wasOn: wasOn }
          })
        }).then(function (seen) {
          check('the keyboard goes into the dialog and comes back out again', function () {
            return ok(seen.inside && document.activeElement === seen.wasOn,
              'went in=' + seen.inside + ', came back to ' +
              (document.activeElement === seen.wasOn ? 'where it was' : 'somewhere else'))
          })
          check('the page behind is unreachable while it is open, and not after', function () {
            return ok(seen.editorOut && seen.dialogIn && gets('#editor').inert !== true,
              'editor inert while open=' + seen.editorOut +
              ', dialog itself inert=' + !seen.dialogIn +
              ', editor inert after=' + (gets('#editor').inert === true))
          })
          document.body.removeChild(parked)
        })
      })

      .then(function () {
        var answer = askText('Name?', 'x')
        return tick().then(function () {
          // three things to land on: the field, cancel, ok. Tab off the end
          // should come round rather than walk out into the page.
          gets('#dialogOk').focus()
          press('Tab')
          var wrapped = document.activeElement === gets('#dialogInput')
          press('Tab', true)
          var back = document.activeElement === gets('#dialogOk')
          press('Escape')
          return answer.then(function () { return { wrapped: wrapped, back: back } })
        }).then(function (seen) {
          check('tab goes round inside the dialog rather than out of it', function () {
            return ok(seen.wrapped && seen.back,
              'forwards wrapped to the field=' + seen.wrapped + ', shift-tab came back=' + seen.back)
          })
        })
      })

      // ------------------------------------------------------- clicking away
      .then(function () {
        var answer = askYesNo('Still here?')
        return tick().then(function () {
          // inside the box first: that must NOT be taken as clicking away
          gets('.dialogBox').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
          var survived = showing()
          gets('#dialog').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
          return answer.then(function (value) { return { survived: survived, value: value } })
        }).then(function (seen) {
          check('clicking the backdrop cancels, clicking the box does not', function () {
            return ok(seen.survived && seen.value === false && !showing(),
              'survived a click inside=' + seen.survived + ', backdrop answered ' + seen.value)
          })
        })
      })

      // ------------------------------------------------------------ queueing
      .then(function () {
        var first = askYesNo('First question?')
        var second = askText('Second question?', '')
        return tick().then(function () {
          var one = heading()
          var onlyOne = showing() && one === 'First question?'
          click('#dialogOk')
          return first.then(tick).then(function () {
            var two = heading()
            gets('#dialogInput').value = 'answered second'
            click('#dialogOk')
            return second.then(function (value) {
              return { onlyOne: onlyOne, one: one, two: two, value: value }
            })
          })
        }).then(function (seen) {
          check('two questions at once queue instead of overwriting each other', function () {
            return ok(seen.onlyOne && seen.two === 'Second question?' && seen.value === 'answered second',
              'first showed [' + seen.one + '], then [' + seen.two + '], answered ' +
              JSON.stringify(seen.value))
          })
        })
      })

      // ------------------------------------------- the box worth pasting into
      .then(function () {
        var answer = askLongText('What should the problem be about?\n\nPaste a whole statement if you have one.', '')
        return tick().then(function () {
          check('a long question opens a box, not a line', function () {
            return ok(showing() && !gets('#dialogText').hidden && gets('#dialogInput').hidden &&
              document.activeElement === gets('#dialogText'),
              'textarea shown=' + !gets('#dialogText').hidden +
              ', one-line field hidden=' + gets('#dialogInput').hidden +
              ', focused=' + (document.activeElement === gets('#dialogText') ? 'textarea' : 'elsewhere'))
          })
          check('it says how to send, because enter no longer does', function () {
            return ok(!gets('#dialogHint').hidden &&
              /ctrl/i.test(gets('#dialogHint').textContent) &&
              /enter/i.test(gets('#dialogHint').textContent),
              'hint shown=' + !gets('#dialogHint').hidden + ' [' + gets('#dialogHint').textContent + ']')
          })

          // plain Enter has to be a newline here, so the dialog must survive it
          gets('#dialogText').value = 'line one'
          press('Enter')
          var survived = showing()

          gets('#dialogText').value = 'two sum\n\ngiven nums and a target,\n\nreturn the indices.'
          press('Enter', false, true)
          return answer.then(function (value) {
            return { survived: survived, value: value }
          })
        }).then(function (seen) {
          check('enter types a new line instead of answering', function () {
            return ok(seen.survived, 'still open after enter=' + seen.survived)
          })
          check('ctrl+enter answers, with every line of it intact', function () {
            var lines = String(seen.value).split('\n\n')
            return ok(!showing() && lines.length === 3 && lines[0] === 'two sum' &&
              lines[2] === 'return the indices.',
              lines.length + ' lines back: ' + JSON.stringify(seen.value).slice(0, 90))
          })
        })
      })

      .then(function () {
        var answer = askLongText('Anything?', 'a suggestion')
        return tick().then(function () {
          // The whole way round, not one step. Leaving the textarea out of the
          // trap still lands Tab on Cancel - the cycle falls back to the first
          // control when it does not recognise where you are - so one step
          // cannot tell the two apart. What breaks is coming BACK: you would
          // be stuck going cancel, ok, cancel, with no way into the box again.
          var seat = function () {
            var el = document.activeElement
            return el && el.id ? '#' + el.id : String(el && el.tagName)
          }
          gets('#dialogText').focus()
          press('Tab')
          var one = seat()
          press('Tab')
          var two = seat()
          press('Tab')
          var three = seat()
          press('Escape')
          return answer.then(function (value) {
            return { one: one, two: two, three: three, value: value }
          })
        }).then(function (seen) {
          check('tab goes round the box, the buttons, and back into the box', function () {
            return ok(seen.one === '#dialogCancel' && seen.two === '#dialogOk' &&
              seen.three === '#dialogText',
              [seen.one, seen.two, seen.three].join(' -> '))
          })
          check('escape still cancels a long question, and cancelling is null', function () {
            return ok(seen.value === null, 'answer=' + JSON.stringify(seen.value))
          })
        })
      })

      .then(function () {
        var answer = askText('And a short one?', 'short')
        return tick().then(function () {
          var backToLine = !gets('#dialogInput').hidden && gets('#dialogText').hidden &&
            gets('#dialogHint').hidden
          press('Enter')
          return answer.then(function (value) {
            return { backToLine: backToLine, value: value }
          })
        }).then(function (seen) {
          // the same dialog serves both, so the long one must not leave its
          // box and its hint behind for the next short question
          check('a short question afterwards is a line again, with no hint', function () {
            return ok(seen.backToLine && seen.value === 'short',
              'line back=' + seen.backToLine + ' answered ' + JSON.stringify(seen.value))
          })
        })
      })

      // ------------------------------------------- the one that cannot be answered
      .then(function () {
        var stop = showBusy('Writing a problem...\n\nThis takes a few seconds.')
        return tick().then(function () {
          check('a waiting dialog says so, with nothing to press', function () {
            return ok(showing() && heading() === 'Writing a problem...' &&
              !gets('#dialogSpinner').hidden &&
              gets('#dialogOk').hidden && gets('#dialogCancel').hidden &&
              gets('#dialogInput').hidden && gets('#dialogText').hidden,
              'spinner=' + !gets('#dialogSpinner').hidden +
              ' ok hidden=' + gets('#dialogOk').hidden +
              ' cancel hidden=' + gets('#dialogCancel').hidden)
          })
          check('it is announced as working, not as a question', function () {
            return ok(gets('#dialog').getAttribute('aria-busy') === 'true' &&
              gets('#dialog').contains(document.activeElement),
              'aria-busy=' + gets('#dialog').getAttribute('aria-busy') +
              ' focus inside=' + gets('#dialog').contains(document.activeElement))
          })
          // enter and a click on the backdrop must not take away the only
          // thing on screen saying the request is still going
          press('Enter')
          gets('#dialog').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
          var stillUp = showing()
          stop()
          return tick().then(function () { return stillUp })
        }).then(function (stillUp) {
          check('enter and clicking away do not dismiss it', function () {
            return ok(stillUp, 'survived both=' + stillUp)
          })
          check('whoever put it up can take it down', function () {
            return ok(!showing() && gets('#dialog').getAttribute('aria-busy') === 'false',
              'showing=' + showing() + ' aria-busy=' + gets('#dialog').getAttribute('aria-busy'))
          })
          check('taking it down twice is not an error', function () {
            stop()
            return ok(!showing(), 'still down=' + !showing())
          })
        })
      })

      .then(function () {
        // a request that never comes back must not be a trap
        var stop = showBusy('Waiting forever...')
        return tick().then(function () {
          press('Escape')
          return tick()
        }).then(function () {
          check('escape is a way out of a wait that never ends', function () {
            var gone = !showing()
            stop()
            return ok(gone, 'escape closed it=' + gone)
          })
        })
      })

      // ------------------------------------------------------------- safety
      .then(function () {
        var answer = askText('Could not read "<img src=x onerror=\'window.__dialogPwned=true\'>".', '')
        return tick().then(function () {
          var asText = heading().indexOf('<img') > -1
          var noImg = !gets('#dialogTitle').querySelector('img')
          press('Escape')
          return answer.then(function () { return { asText: asText, noImg: noImg } })
        }).then(function (seen) {
          check('a message is written as text, so a filename cannot run code', function () {
            return ok(seen.asText && seen.noImg && !window.__dialogPwned,
              'kept as text=' + seen.asText + ' no element built=' + seen.noImg +
              ' payload ran=' + (window.__dialogPwned === true))
          })
        })
      })

      .then(function () {
        // The point of all of the above is that the native ones are GONE. A
        // single alert() left behind would block the page and look like another
        // application, and nothing else here would notice.
        var files = ['/scripts/index.js', '/scripts/problems.js', '/scripts/store.js']
        return Promise.all(files.map(function (f) {
          return fetch(f).then(function (r) { return r.text() }).then(function (t) {
            var hits = t.match(/(^|[^\w.$])(alert|confirm|prompt)\s*\(/g) || []
            return hits.length ? f + ' has ' + hits.length : ''
          })
        })).then(function (found) {
          var bad = found.filter(Boolean)
          check('no native dialog is left anywhere in the app', function () {
            return ok(bad.length === 0, bad.length ? bad.join('; ') : files.length + ' files, none')
          })
        })
      })
  }

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
    var realConfirm = askYesNo
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
        askYesNo = function () { return true }
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
        askYesNo = realConfirm

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
        var realPrompt = askText
        askText = function () { return '  before the rewrite  ' }
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
            askText = function () { return 'renamed' }
            return snapshotWithTitle()
              .then(function () { return listSnapshots(mine.id) })
              .then(function (after) {
                check('naming a state that is already saved renames it, it does not copy it', function () {
                  return ok(after.length === count && after[0].title === 'renamed',
                    after.length + ' snapshots (was ' + count + '), newest named ' +
                    JSON.stringify(after[0].title))
                })
                // cancelling the prompt takes nothing at all
                askText = function () { return null }
                setPaneText('main', 'not worth marking')
                return snapshotWithTitle()
              })
              .then(function () { return listSnapshots(mine.id) })
              .then(function (after) {
                check('cancelling the name takes no snapshot', function () {
                  return ok(after.length === count, after.length + ' snapshots, still ' + count)
                })
                askText = realPrompt
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
        var realConfirm2 = askYesNo
        askYesNo = function () { return true }
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
          askYesNo = realConfirm2
        })
      })
      .then(function () {
        // clear history empties this project and leaves the others alone
        var other = makeProject({ name: 'not this one', code: 'keep me' })
        var realConfirm3 = askYesNo
        askYesNo = function () { return true }
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
            askYesNo = realConfirm3
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
        askYesNo = function () { return true }
        return removeProject()
          .then(function () { return listSnapshots(doomed) })
          .then(function (left) {
            check('deleting a project leaves no snapshots behind', function () {
              return ok(left.length === 0, left.length + ' snapshots still stored')
            })
            askYesNo = realConfirm
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
    var realConfirm = askYesNo
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
          askYesNo = function () { return true }
          if (glyph) glyph.click()
          return waitFor(function () { return diffShowing() }, 5000)
            .then(waitForDiff)
            .then(function () {
              check('the compare glyph compares instead of restoring', function () {
                return ok(!!glyph && diffShowing() && contentOf('main') === before,
                  'glyph found=' + !!glyph + ', diff open=' + diffShowing() +
                  ', the pane still holds ' + JSON.stringify(String(contentOf('main')).slice(0, 24)))
              })
              askYesNo = realConfirm
            })
        })
      })
      .then(function () {
        if (!taken) return null
        // Restoring from the bar is the point of having looked: decide, then
        // act, without going back to a list of timestamps.
        askYesNo = function () { return true }
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
            askYesNo = realConfirm
          })
      })
      .then(function () {
        if (!taken) return null
        // deleting the snapshot on screen must not leave it on screen
        return openDiff(taken.id).then(waitForDiff).then(function () {
          askYesNo = function () { return true }
          return removeSnapshot(taken.id).then(function () {
            check('deleting the snapshot being compared closes the comparison', function () {
              return ok(!diffShowing() && gets('#diffPane').style.display === 'none',
                'diff still open=' + diffShowing())
            })
            askYesNo = realConfirm
          })
        })
      })
      .then(function () {
        askYesNo = function () { return true }
        return removeProject()
          .then(function () { askYesNo = realConfirm })
          .then(function () { return switchProject(home.id) })
      })
  }

  // -------------------------------------------------------------- imports
  // Three levels, because the failure modes are different at each: what the
  // scanner finds, what the document ends up saying, and whether a real package
  // actually arrives and runs.

  function importScannerChecks() {
    check('every import form a snippet writes is found', function () {
      var source = [
        'import a from "alpha"',
        'import "beta"',
        'import { c } from "gamma"',
        'import * as d from "delta"',
        'export { e } from "epsilon"',
        'export * from "zeta"',
        'const later = import("eta")',
        'import {',
        '  spread, over, lines',
        '} from "theta"',
      ].join('\n')
      var found = findSpecifiers(source)
      var want = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta']
      var missing = want.filter(function (w) { return found.indexOf(w) < 0 })
      return ok(missing.length === 0 && found.length === want.length,
        'found [' + found + ']' + (missing.length ? ', missing ' + missing.join(', ') : ''))
    })

    check('an import that is only mentioned, not written, is not an import', function () {
      // a line comment, a block comment, and a string. Finding any of these
      // would flip the snippet into module mode and change how it runs.
      var source = [
        '// import ghost from "commented-out"',
        '/* import ghost from "block-commented" */',
        'const help = "import x from \'quoted\'"',
        'console.log(help)',
      ].join('\n')
      return ok(findSpecifiers(source).length === 0 && hasImports(source) === false,
        'found [' + findSpecifiers(source) + '], hasImports=' + hasImports(source))
    })

    check('an address is left alone, but still needs a module', function () {
      var source = 'import x from "https://esm.sh/alpha"\nimport y from "./local.js"\n'
      return ok(findSpecifiers(source).length === 0 && hasImports(source) === true,
        'mapped [' + findSpecifiers(source) + '] (want none), hasImports=' + hasImports(source))
    })

    check('a regular expression holding a quote does not derail the scan', function () {
      // /['"]/ used to read as the start of a string and swallow what followed
      var source = 'const quoted = /[\'"]/\nif (quoted.test("x")) { }\nimport real from "omega"\n'
      return ok(findSpecifiers(source).join() === 'omega',
        'found [' + findSpecifiers(source) + '] (want omega)')
    })

    check('a pinned version, a scope and a deep path all resolve', function () {
      var map = importMapFor(['import a from "lodash-es@4.17"\nimport b from "@scope/pkg"\n' +
        'import c from "lodash-es/debounce"\n'])
      var i = map.imports
      return ok(i['lodash-es@4.17'] === 'https://esm.sh/lodash-es@4.17' &&
        i['@scope/pkg'] === 'https://esm.sh/@scope/pkg' &&
        i['lodash-es/debounce'] === 'https://esm.sh/lodash-es/debounce' &&
        i['lodash-es/'] === 'https://esm.sh/lodash-es/' &&
        i['@scope/pkg/'] === 'https://esm.sh/@scope/pkg/',
        JSON.stringify(i))
    })

    return Promise.resolve()
  }

  function importDocumentChecks() {
    var settings = { lang: 'html', css: false, js: true }

    check('a snippet with no imports still runs as a classic script', function () {
      var built = buildPreviewDoc({ code: '<p>x</p>', js: 'var a = 1' }, settings)
      return ok(built.html.indexOf('type="module"') === -1 &&
        built.html.indexOf('importmap') === -1,
        'module=' + (built.html.indexOf('type="module"') > -1) +
        ', map=' + (built.html.indexOf('importmap') > -1))
    })

    check('a snippet that imports runs as a module, with the map above it', function () {
      var built = buildPreviewDoc({ code: '<p>x</p>', js: 'import a from "alpha"\na()' }, settings)
      var map = built.html.indexOf('importmap')
      var mod = built.html.indexOf('type="module"')
      return ok(map > -1 && mod > -1 && map < mod &&
        built.html.indexOf('"alpha":"https://esm.sh/alpha"') > -1,
        'map at ' + map + ', module at ' + mod)
    })

    check('the map is one line, so it moves nobody else down', function () {
      // preview.js rule 2: anything above the user's code with a newline in it
      // makes every reported line number wrong
      var built = buildPreviewDoc({ code: '<p>x</p>', js: 'import a from "alpha"\na()' }, settings)
      var tag = built.html.slice(built.html.indexOf('<script type="importmap"'))
      tag = tag.slice(0, tag.indexOf('</scr' + 'ipt>'))
      return ok(tag.indexOf('\n') === -1, JSON.stringify(tag.slice(0, 80)))
    })

    check('the js pane still starts exactly where the document says it does', function () {
      var js = 'import a from "alpha"\nconst b = 2\nthrow new Error("x")'
      var built = buildPreviewDoc({ code: '<p>x</p>', js: js }, settings)
      var at = built.sources['quickcode-js']
      var line = built.html.split('\n')[at.startLine - 1]
      return ok(!!at && line === 'import a from "alpha"',
        'startLine ' + (at && at.startLine) + ' holds ' + JSON.stringify(line))
    })

    check('a specifier cannot close the map tag early and inject a script', function () {
      // The hostile text is inside the map, inert, which is correct. What would
      // be a hole is the map tag ENDING before it - so the question is where the
      // first closing tag lands, not whether the text appears.
      var hostile = 'import x from "evil</scr' + 'ipt><scr' + 'ipt>window.pwned=1"'
      var built = buildPreviewDoc({ code: '<p>x</p>', js: hostile }, settings)
      var from = built.html.indexOf('<scr' + 'ipt type="importmap">')
      var closes = built.html.indexOf('</scr' + 'ipt>', from)
      var payload = built.html.indexOf('window.pwned', from)
      return ok(from > -1 && payload > -1 && closes > payload,
        'map opens at ' + from + ', the hostile text is at ' + payload +
        ', and the tag closes at ' + closes + ' (which must be later)')
    })

    return Promise.resolve()
  }

  function importLiveChecks() {
    var home = project
    var mine = makeProject({ name: 'importing', code: '<h1>imports</h1>', css: '', js: '' })

    var runSnippet = function (js, waitForText, ms) {
      setPaneText('js', js)
      clearConsole()
      runPreview()
      return waitFor(function () { return !!rowSaying(waitForText) }, ms || 20000)
    }

    return saveProject(mine)
      .then(function () { return openRecord(mine) })
      .then(function () {
        setJsLang('javascript')
        gets('#jsCheck').checked = true
        saveSettings({ js: true, css: false })
        setPaneText('main', '<h1>imports</h1>')
        splitMenu('preview')
        // one render, three claims: a bare name, a pinned one, and a dynamic
        // import - then a throw, to see what line it is reported on
        return runSnippet([
          'import { nanoid } from "nanoid"',
          'import { customAlphabet } from "nanoid@5"',
          'const extra = await import("nanoid")',
          'console.log("IMPORTS", typeof nanoid, typeof customAlphabet, typeof extra.nanoid)',
          'throw new Error("thrown from a module")',
        ].join('\n'), 'IMPORTS')
      })
      .then(function (spoke) {
        check('a bare import, a pinned one and a dynamic one all run in the preview', function () {
          var row = rowSaying('IMPORTS')
          return ok(spoke && !!row && row.textContent.indexOf('function  function  function') > -1,
            row ? JSON.stringify(row.textContent) : 'nothing logged: ' + consoleRowsText().join(' | '))
        })
        return waitFor(function () { return !!rowSaying('thrown from a module') }, 8000)
      })
      .then(function () {
        check('a throw inside a module is still reported against the js pane line', function () {
          var row = rowSaying('thrown from a module')
          return ok(!!row && whereOf(row) === 'js:5',
            row ? 'reported at ' + whereOf(row) + ' (want js:5)' : 'never arrived')
        })
      })
      .then(function () {
        // the classic path, untouched: a top-level var still reaches window
        return runSnippet('var leaked = "yes"\nconsole.log("GLOBAL", typeof window.leaked)', 'GLOBAL', 10000)
      })
      .then(function () {
        check('without imports a top-level var still reaches window', function () {
          var row = rowSaying('GLOBAL')
          return ok(!!row && row.textContent.indexOf('GLOBAL  string') > -1,
            row ? JSON.stringify(row.textContent) : 'nothing logged')
        })
      })
      .then(function () {
        // a package that does not exist. The browser says nothing at all about
        // this - no error event, no rejection - so the message has to be ours.
        return runSnippet([
          'import ghost from "qc-no-such-package-9z8y7"',
          'console.log("SHOULD NOT RUN", ghost)',
        ].join('\n'), 'Cannot import')
      })
      .then(function (spoke) {
        check('a package that does not exist says so, in words', function () {
          var row = rowSaying('Cannot import')
          return ok(spoke && !!row &&
            row.textContent.indexOf('qc-no-such-package-9z8y7') > -1 &&
            row.textContent.indexOf('404') > -1,
            row ? JSON.stringify(row.textContent) : 'nothing said: ' + consoleRowsText().join(' | '))
        })
        check('and nothing of that snippet runs', function () {
          var ran = !!rowSaying('SHOULD NOT RUN')
          return ok(!ran, ran ? 'it ran anyway: ' + consoleRowsText().join(' | ')
                              : 'the module never executed, as it should not have')
        })
      })
      .then(function () {
        // typescript and imports together: the import survives compiling, so the
        // compiled output is what has to end up as a module
        setJsLang('typescript')
        return runSnippet([
          'import { nanoid } from "nanoid"',
          'const id: string = nanoid()',
          'console.log("TS IMPORT", typeof id)',
        ].join('\n'), 'TS IMPORT')
      })
      .then(function (spoke) {
        check('typescript and imports work together', function () {
          var row = rowSaying('TS IMPORT')
          return ok(spoke && !!row && row.textContent.indexOf('TS IMPORT  string') > -1,
            row ? JSON.stringify(row.textContent) : 'nothing logged: ' + consoleRowsText().join(' | '))
        })
        check('typescript does not complain about a package it cannot see', function () {
          // It genuinely cannot: no node_modules, and no declarations for
          // something fetched at run time. Saying so would be a complaint about
          // code the check above just watched work.
          var row = rowSaying('Cannot find module')
          return ok(!row, row ? 'it said ' + JSON.stringify(row.textContent) : 'it said nothing, rightly')
        })
        setJsLang('javascript')
      })
      .then(function () {
        // the pin is honoured by esm.sh, not just carried in the map
        return fetch('https://esm.sh/nanoid@5').then(function (r) {
          return r.text().then(function (body) { return { url: r.url, body: body } })
        }, function (e) { return { url: '', body: 'fetch failed: ' + e.message } })
      })
      .then(function (answer) {
        check('a pinned version resolves to that version', function () {
          return ok(/nanoid@5/.test(answer.url + answer.body),
            'esm.sh answered ' + JSON.stringify(String(answer.body).slice(0, 120)))
        })
      })
      .then(function () {
        var realConfirm = askYesNo
        askYesNo = function () { return true }
        return removeProject()
          .then(function () { askYesNo = realConfirm })
          .then(function () { return switchProject(home.id) })
      })
  }

  // Taking the suite's own server down does not take esm.sh with it, so the
  // offline case cannot produce a real one of these. The branch is driven
  // directly instead: what is being checked is the wording the user ends up
  // reading, and that a dead network is told apart from a missing package.
  function importOfflineChecks() {
    var realFetch = window.fetch
    var described = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine')
    var pretendOffline = function (offline) {
      try {
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: function () { return !offline } })
        return navigator.onLine === !offline
      } catch (err) {
        return false
      }
    }

    window.fetch = function () { return Promise.reject(new TypeError('Failed to fetch')) }
    var couldPretend = pretendOffline(true)

    return importProblem('qc-offline-probe')
      .then(function (offlineMessage) {
        pretendOffline(false)
        return importProblem('qc-online-probe').then(function (onlineMessage) {
          check('being offline is reported as being offline, not as a missing package', function () {
            if (!couldPretend) return ok(false, 'navigator.onLine could not be overridden here')
            return ok(/offline/i.test(offlineMessage) &&
              offlineMessage.indexOf('qc-offline-probe') > -1 &&
              !/404|no such package/i.test(offlineMessage),
              JSON.stringify(offlineMessage))
          })
          check('a network that is up but unreachable says that instead', function () {
            return ok(/could not be reached/i.test(onlineMessage) &&
              !/offline/i.test(onlineMessage), JSON.stringify(onlineMessage))
          })
        })
      })
      .then(function () {
        window.fetch = realFetch
        if (described) Object.defineProperty(navigator, 'onLine', described)
        else delete navigator.onLine
      }, function (err) {
        window.fetch = realFetch
        if (described) Object.defineProperty(navigator, 'onLine', described)
        check('the offline wording could be checked', function () { return ok(false, String(err)) })
      })
  }

  function importChecks() {
    return importScannerChecks()
      .then(importDocumentChecks)
      .then(importLiveChecks)
      .then(importOfflineChecks)
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
        var realConfirm = askYesNo
        askYesNo = function () { return true }
        return removeProject()
          .then(function () { askYesNo = realConfirm })
          .then(function () { return switchProject(home.id) })
      })
  }

  // ---------------------------------------------------------- ask claude
  // Nothing here touches the network or needs a key: askClaude is replaced, so
  // what is checked is the question that would have been asked and what is done
  // with the reply. The live call cannot be checked from here at all - see the
  // Outcome in docs/16.

  // ---------------------------------------------------------- asking a model
  // The key is on the server, so most of what used to be here is gone with it:
  // there is no dialog, no stored key, and nothing to keep out of a share link.
  // What replaces those is one stronger claim - the browser holds and sends
  // nothing secret - plus the four different things that can go wrong.

  function aiChecks() {
    var realAsk = askModel
    var asked = []

    var stub = function (reply) {
      return function (system, question) {
        asked.push(question)
        return Promise.resolve(String(reply))
      }
    }

    var lastAiRow = function () {
      var rows = getsAll('#consoleOut .log-ai')
      return rows[rows.length - 1] || null
    }

    var errorRow = function (message, pane, line) {
      clearConsole()
      logToConsole({ kind: 'error', args: [message], where: pane ? { pane: pane, line: line } : null })
      return gets('#consoleOut [data-ask-ai]')
    }

    return Promise.resolve()
      .then(function () {
        check('the request carries no key, because the browser has none', function () {
          var request = aiRequestFor('be brief', 'hello')
          var serialised = JSON.stringify(request)
          return ok(request.url === '/api/ai' &&
            !request.headers.authorization &&
            !/bearer|api[-_]?key|gsk[-_]|sk-/i.test(serialised) &&
            request.body.system === 'be brief' && request.body.question === 'hello',
            serialised.slice(0, 160))
        })
        check('nothing secret is stored in this browser either', function () {
          // Whatever the app keeps, none of it should look like a credential.
          var suspicious = []
          for (var i = 0; i < localStorage.length; i++) {
            var name = localStorage.key(i)
            var value = String(localStorage.getItem(name) || '')
            if (/gsk[-_]|sk-ant|api[-_]?key|secret|bearer/i.test(name + ' ' + value)) {
              suspicious.push(name)
            }
          }
          return ok(suspicious.length === 0,
            suspicious.length ? 'these look like credentials: ' + suspicious.join(', ')
                              : localStorage.length + ' keys stored, none credential-shaped')
        })
      })
      .then(function () {
        check('only error rows offer to be explained', function () {
          clearConsole()
          logToConsole({ kind: 'log', args: ['just output'] })
          var onLog = getsAll('#consoleOut [data-ask-ai]').length
          logToConsole({ kind: 'error', args: ['a real problem'] })
          var afterError = getsAll('#consoleOut [data-ask-ai]').length
          return ok(onLog === 0 && afterError === 1,
            onLog + ' on a log row, ' + afterError + ' once an error arrived')
        })
      })
      .then(function () {
        // Clicking the row is what builds the question, so the click is what is
        // exercised - calling explainError directly would not prove the
        // affordance is wired to anything.
        setJsLang('javascript')
        setPaneText('main', '<p>markup</p>')
        setPaneText('js', 'const a = 1\nconst b = 2\nboom()')
        asked = []
        askModel = stub('fine')
        var ask = errorRow('boom is not defined', 'js', 3)
        if (ask) ask.click()
        return waitFor(function () { return asked.length > 0 }, 4000)
      })
      .then(function () {
        check('the question carries the error, the pane, the line and the code', function () {
          var prompt = asked[0] || ''
          // the whole sentence, not just the words in it: an earlier version of
          // this passed on the listing's heading while the sentence above it
          // called the same pane something else
          return ok(prompt.indexOf('boom is not defined') > -1 &&
            prompt.indexOf('line 3 of the javascript pane') > -1 &&
            prompt.indexOf('<p>markup</p>') > -1 &&
            prompt.indexOf('--- the javascript pane ---') > -1,
            JSON.stringify(prompt.slice(0, 200)))
        })
        check('the question calls each pane one name throughout', function () {
          var prompt = asked[0] || ''
          return ok(!/\bthe js pane\b/.test(prompt) && !/\bthe main pane\b/.test(prompt),
            (prompt.match(/the \w+ pane/g) || []).join(' / '))
        })
        check('the answer reaches the console', function () {
          var row = lastAiRow()
          return ok(!!row && row.textContent === 'fine',
            row ? JSON.stringify(row.textContent) : 'no reply row')
        })
      })
      .then(function () {
        // An answer is text from a model, not markup this project wrote. The
        // payload sets a flag rather than calling alert(): a modal dialog in this
        // page has nothing to dismiss it, so a vulnerable version would hang the
        // run instead of failing it.
        window.__pwned = false
        askModel = stub('<img src=x onerror="window.__pwned=true"><b>bold</b>')
        var ask = errorRow('something', 'js', 1)
        if (ask) ask.click()
        return waitFor(function () { return !!lastAiRow() && /img/.test(lastAiRow().textContent) }, 4000)
      })
      .then(function () {
        check('an answer is rendered as text, never as markup', function () {
          var row = lastAiRow()
          return ok(!!row && row.children.length === 0 && !row.querySelector('img') &&
            window.__pwned === false && row.textContent.indexOf('<img') > -1,
            row ? row.children.length + ' child elements, payload ran=' + window.__pwned +
              ', text begins ' + JSON.stringify(row.textContent.slice(0, 30)) : 'no reply row')
        })
      })
      .then(function () {
        // Four different things, four different messages. A spent allowance is
        // "wait"; a refused key is not the reader's problem and should say so.
        check('each kind of failure says which kind it was', function () {
          var spent = aiFailure({ status: 429 })
          var refused = aiFailure({ status: 401 })
          var off = aiFailure({ status: 503, message: 'AI is switched off on this site.' })
          var huge = aiFailure({ status: 413, message: 'too much' })
          var dead = aiFailure({ unreachable: true })
          // two different 404s: a model groq withdrew, and no function at all,
          // which is what the static files on their own look like
          var gone = aiFailure({ status: 404, message: '' })
          var absent = aiFailure({ status: 404, noEndpoint: true })
          return ok(/allowance/.test(spent) && /tomorrow/.test(spent) &&
            /tell whoever runs this site/.test(refused) &&
            /switched off/.test(off) && /too much/.test(huge) &&
            /did not answer|offline/.test(dead) &&
            /renamed or withdrawn/.test(gone) && /no AI endpoint here/.test(absent),
            [spent, refused, off, huge, dead, gone, absent].join(' | ').slice(0, 320))
        })
        askModel = function () { return Promise.reject({ status: 429 }) }
        clearConsole()
        var ask = errorRow('something', 'js', 1)
        if (ask) ask.click()
        return waitFor(function () {
          var row = lastAiRow()
          return !!row && row.textContent.indexOf('Could not') > -1
        }, 4000)
      })
      .then(function (spoke) {
        check('a failure is reported in the console rather than thrown away', function () {
          var row = lastAiRow()
          return ok(spoke && !!row && /allowance/.test(row.textContent) &&
            window.__errors.length === 0,
            row ? JSON.stringify(row.textContent) : 'nothing was said')
        })
      })
      .then(function () {
        // Two answers writing into the console at once would interleave.
        var release = null
        var calls = 0
        askModel = function () {
          calls++
          return new Promise(function (resolve) { release = function () { resolve('done') } })
        }
        var first = errorRow('one', 'js', 1)
        if (first) first.click()
        return waitFor(function () { return calls > 0 }, 4000).then(function () {
          var second = gets('#consoleOut [data-ask-ai]')
          if (second) second.click()
          return waitFor(function () { return false }, 400).then(function () {
            check('a second question while one is in flight is ignored', function () {
              return ok(calls === 1, calls + ' calls made, wanted 1')
            })
            if (release) release()
            return waitFor(function () { return false }, 200)
          })
        })
      })
      .then(function () {
        askModel = realAsk
        clearConsole()
      })
  }

  // ------------------------------------------------------ practice problems
  // A model asked for JSON will sometimes fence it, or say hello first, or stop
  // halfway. None of that is worth failing over, so most of this is about the
  // parser - and about the new project landing somewhere useful without
  // disturbing whatever was already open.

  function problemChecks() {
    var realAsk = askModel
    var realPrompt = askLongText
    var asked = []
    var home = project
    var made = []

    var PROBLEM = {
      name: 'Two Sum',
      js: '// Two Sum\n// given nums and a target...\nfunction twoSum(nums, t) {\n  // your code here\n}\ncheck(twoSum([2,7], 9), [0,1])',
      html: '<div id="out"></div>',
      css: '#out { color: teal }',
    }
    var asJson = JSON.stringify(PROBLEM)

    // The console keeps every row, so the first .log-ai is whatever was said
    // earliest - which is not the answer any of these steps is about.
    var lastAiRow = function () {
      var rows = getsAll('#consoleOut .log-ai')
      return rows[rows.length - 1] || null
    }

    var answering = function (reply) {
      askModel = function (system, question) {
        asked.push(question)
        return Promise.resolve(reply)
      }
    }

    return Promise.resolve()
      .then(function () {
        check('a clean json answer becomes a problem', function () {
          var parsed = parseProblem(asJson)
          return ok(parsed.parsed === true && parsed.name === 'Two Sum' &&
            parsed.js.indexOf('function twoSum') > -1 &&
            parsed.code === '<div id="out"></div>' && parsed.css.indexOf('teal') > -1,
            JSON.stringify(parsed).slice(0, 140))
        })
        check('a fenced answer, and one with chatter round it, parse the same', function () {
          var fenced = parseProblem('```json\n' + asJson + '\n```')
          var chatty = parseProblem('Sure! Here is a good one:\n' + asJson + '\nGood luck!')
          return ok(fenced.parsed && fenced.name === 'Two Sum' &&
            chatty.parsed && chatty.name === 'Two Sum',
            'fenced=' + fenced.name + ' / chatty=' + chatty.name)
        })
        check('an answer that is not json at all is still kept', function () {
          // most likely the problem written as plain javascript, which is worth
          // having - better than an error message and nothing
          var plain = parseProblem('// Reverse a string\nfunction reverse(s) {\n}\n')
          return ok(plain.parsed === false && plain.js.indexOf('function reverse') > -1 &&
            plain.name === 'Practice problem' && plain.code === '',
            JSON.stringify(plain).slice(0, 120))
        })
        check('json that stops halfway falls back instead of throwing', function () {
          // two shapes of broken, because they fail in different places: one
          // never reaches the parser (no closing brace at all) and one does
          var cut = parseProblem('{"name": "Half", "js": "function f() {')
          var bad = parseProblem('{"name": "Half", "js": "oops",}')
          return ok(cut.parsed === false && cut.js.indexOf('Half') > -1 &&
            bad.parsed === false && bad.js.indexOf('oops') > -1,
            'no-brace: ' + JSON.stringify(cut.js.slice(0, 40)) +
            ' / unparseable: ' + JSON.stringify(bad.js.slice(0, 40)))
        })
        check('a fenced answer that is not json leaves no backticks in the editor', function () {
          // the fallback keeps the text as it stands, so this is the path where
          // stripping the fence actually matters
          var fenced = parseProblem('```js\nfunction reverse(s) {}\n```')
          return ok(fenced.parsed === false && fenced.js.indexOf('`') === -1 &&
            fenced.js.indexOf('function reverse') > -1,
            JSON.stringify(fenced.js))
        })
      })
      .then(function () {
        // what gets asked for
        asked = []
        answering(asJson)
        askLongText = function () { return 'binary trees, medium' }
        return newAiProblem()
      })
      .then(function (record) {
        if (record) made.push(record.id)
        check('the topic you type is what gets asked for', function () {
          return ok((asked[0] || '').indexOf('binary trees, medium') > -1,
            JSON.stringify(asked[0] || ''))
        })
        check('the problem arrives as a new project, with the panes filled', function () {
          return ok(!!record && project.id === record.id && project.id !== home.id &&
            project.name === 'Two Sum' &&
            contentOf('js').indexOf('function twoSum') > -1 &&
            contentOf('main') === '<div id="out"></div>' &&
            contentOf('css').indexOf('teal') > -1,
            'open=' + (project && project.name) + ', js=' +
            JSON.stringify(contentOf('js').slice(0, 30)))
        })
        check('it lands on the preview, with both toggles set to match', function () {
          return ok(quickEdit.split === true && quickEdit.splitLang === 'preview' &&
            quickEdit.js === true && quickEdit.css === true && quickEdit.tab === 'js',
            'split=' + quickEdit.split + ' showing ' + quickEdit.splitLang +
            ', js=' + quickEdit.js + ' css=' + quickEdit.css + ' tab=' + quickEdit.tab)
        })
        return getProject(home.id)
      })
      .then(function (untouched) {
        check('the project that was open is left exactly as it was', function () {
          return ok(!!untouched && untouched.code === home.code && untouched.js === home.js,
            untouched ? 'still holds ' + JSON.stringify(String(untouched.code).slice(0, 24))
                      : 'it is gone')
        })
      })
      .then(function () {
        // a pure algorithm problem sends no markup, so the css toggle must not
        // be turned on for a pane with nothing in it
        answering(JSON.stringify({ name: 'Reverse', js: 'function r(){}', html: '', css: '' }))
        askLongText = function () { return '' }
        return newAiProblem()
      })
      .then(function (record) {
        if (record) made.push(record.id)
        check('a problem with no markup does not switch on panes it does not use', function () {
          return ok(!!record && quickEdit.css === false && quickEdit.js === true,
            'css=' + quickEdit.css + ' js=' + quickEdit.js)
        })
        check('an empty topic asks for anything rather than for nothing', function () {
          return ok((asked[1] || '').indexOf('any problem') > -1, JSON.stringify(asked[1] || ''))
        })
      })
      .then(function () {
        // nothing usable came back
        var before = project.id
        clearConsole()
        answering('   ')
        askLongText = function () { return 'x' }
        return newAiProblem().then(function (record) {
          check('an unusable answer sets no project and says so', function () {
            var row = lastAiRow()
            return ok(record === null && project.id === before &&
              !!row && /nothing usable/i.test(row.textContent),
              'record=' + record + ', said ' + JSON.stringify(row ? row.textContent : ''))
          })
        })
      })
      .then(function () {
        // cancelled at the topic
        var before = project.id
        var calls = 0
        askModel = function () { calls++; return Promise.resolve(asJson) }
        askLongText = function () { return null }
        return newAiProblem().then(function (record) {
          check('cancelling the topic asks nothing and sets nothing', function () {
            return ok(record === null && calls === 0 && project.id === before,
              calls + ' calls, record=' + record)
          })
        })
      })
      .then(function () {
        // a failure says which service and why, in the console
        var before = project.id
        clearConsole()
        // deliberately looking at something else when it fails
        splitMenu('css')
        askModel = function () { return Promise.reject({ status: 429, message: 'slow down' }) }
        askLongText = function () { return 'arrays' }
        return newAiProblem().then(function (record) {
          check('a failed request reports in the console and sets no project', function () {
            var row = lastAiRow()
            return ok(record === null && project.id === before && !!row &&
              /allowance/.test(row.textContent) && window.__errors.length === 0,
              'said ' + JSON.stringify(row ? row.textContent : ''))
          })
          check('and the console is brought into view, so the message is seen', function () {
            // a message nobody can see is not a message: this request failed
            // before anything would have opened the preview
            return ok(previewShowing() && gets('#previewPane').style.display === 'flex',
              'preview showing=' + previewShowing() +
              ', pane display=' + JSON.stringify(gets('#previewPane').style.display))
          })
        })
      })
      .then(function () {
        check('the project menu offers to set one', function () {
          var labels = Array.prototype.map.call(getsAll('#projectList [data-action]'), function (r) {
            return r.textContent
          })
          return ok(labels.indexOf('+ AI practice problem') > -1, labels.join(' / '))
        })
      })
      .then(function () {
        // The model is told the html pane is a fragment. When it ignores that,
        // what arrives is a whole document naming a script file that is not
        // here - so a project written to teach you to read the console opens
        // with a 404 in it.
        var whole = [
          '<!DOCTYPE html>', '<html lang="en">', '<head>', '<meta charset="UTF-8">',
          '<title>Bubble Sort</title>', '<style>.bar { background: steelblue }</style>',
          '<link rel="stylesheet" href="style.css">', '</head>', '<body>',
          '<div id="bars"></div>', '<button id="runBtn">Run</button>',
          '<script src="script.js"><' + '/script>',
          '<script src="https://cdn.jsdelivr.net/npm/thing"><' + '/script>',
          '</body>', '</html>',
        ].join('\n\n')
        var out = parseProblem(JSON.stringify({ name: 'Bubble Sort', js: 'x', html: whole })).code

        check('a whole document is taken back down to a fragment', function () {
          return ok(!/<!doctype/i.test(out) && !/<html[\s>]/i.test(out) &&
            !/<body[\s>]/i.test(out) && !/<head[\s>]/i.test(out) &&
            /id="bars"/.test(out) && /id="runBtn"/.test(out),
            out.replace(/\n\n/g, ' ').slice(0, 150))
        })
        check('a script file that is not here is dropped, a cdn one is kept', function () {
          return ok(out.indexOf('script.js') < 0 && out.indexOf('style.css') < 0 &&
            out.indexOf('cdn.jsdelivr.net') > -1,
            'local script gone=' + (out.indexOf('script.js') < 0) +
            ', local stylesheet gone=' + (out.indexOf('style.css') < 0) +
            ', cdn kept=' + (out.indexOf('cdn.jsdelivr.net') > -1))
        })
        check('a style left in the head is not thrown away with the head', function () {
          return ok(/steelblue/.test(out), out.indexOf('<style') > -1 ? 'style kept' : 'style LOST')
        })
      })

      .then(function () {
        // the common case must come through untouched
        var fragment = '<div id="out"></div>\n\n<script>window.__inline = 1<' + '/script>'
        var out = parseProblem(JSON.stringify({ name: 'x', js: 'y', html: fragment })).code
        check('a fragment keeps its own markup and its inline script', function () {
          return ok(/id="out"/.test(out) && /__inline/.test(out) && out.indexOf('<script') > -1,
            out.replace(/\n\n/g, ' ').slice(0, 120))
        })
        check('no html at all stays no html', function () {
          return ok(parseProblem(JSON.stringify({ name: 'x', js: 'y', html: '' })).code === '',
            'empty stays empty')
        })
      })

      .then(function () {
        // the integration: the wait has to be on screen WHILE the model is
        // working, which a stub that resolves immediately can never show
        var release = null
        askModel = function () {
          return new Promise(function (resolve) { release = function () { resolve(asJson) } })
        }
        askLongText = function () { return 'two sum' }
        var making = newAiProblem()
        return new Promise(function (r) { setTimeout(r, 0) }).then(function () {
          var up = gets('#dialog').classList.contains('showing')
          var says = gets('#dialogTitle').textContent
          var busy = gets('#dialog').getAttribute('aria-busy')
          if (release) release()
          return making.then(function (record) {
            return { up: up, says: says, busy: busy, record: record }
          })
        }).then(function (seen) {
          check('the wait is on screen while the model is actually working', function () {
            return ok(seen.up && seen.busy === 'true' && /writing a problem/i.test(seen.says),
              'dialog up=' + seen.up + ' aria-busy=' + seen.busy + ' [' + seen.says + ']')
          })
          check('and it is gone once the problem has been set', function () {
            return ok(!gets('#dialog').classList.contains('showing') && seen.record,
              'still up=' + gets('#dialog').classList.contains('showing') +
              ' project made=' + !!seen.record)
          })
        })
      })

      .then(function () {
        askModel = realAsk
        askLongText = realPrompt
        clearConsole()
        return switchProject(home.id)
      })
      .then(function () {
        // the problems this left behind, so the picker checks elsewhere still
        // see what they expect
        return made.reduce(function (chain, id) {
          return chain.then(function () { return deleteProject(id) })
            .then(function () { return dropSnapshotsFor(id) })
        }, Promise.resolve())
      })
      .then(refreshProjects)
  }

  // ------------------------------------------------------------------ jsx
  // JSX had to wait for item 11: the automatic runtime emits an import of
  // react/jsx-runtime, and before the import map there was nothing that could
  // resolve it. So most of this is about that join, and about the editor and the
  // compiler agreeing on the same text.

  function jsxChecks() {
    var home = project
    var mine = makeProject({
      name: 'jsx',
      code: '<div id="root"></div>',
      css: '',
      js: '',
    })
    var COMPONENT = [
      'interface Props { label: string }',
      '',
      'const Button = ({ label }: Props) => (',
      '  <button className="go">',
      '    {label}',
      '  </button>',
      ')',
      '',
      'console.log("JSX BUILT", typeof Button)',
      'throw new Error("thrown under jsx")',
    ].join('\n')

    return saveProject(mine)
      .then(function () { return openRecord(mine) })
      .then(function () {
        setJsLang('typescript')
        gets('#jsCheck').checked = true
        saveSettings({ js: true, css: false })
        setPaneText('main', '<div id="root"></div>')
        // the preview only builds while its tab is the one showing
        splitMenu('preview')
        return jsForPreview(COMPONENT)
      })
      .then(function (js) {
        check('jsx compiles to calls on the automatic runtime', function () {
          return ok(js.indexOf('react/jsx-runtime') > -1 && /_jsx/.test(js) &&
            js.indexOf('<button') === -1,
            JSON.stringify(js.replace(/\n/g, ' | ').slice(0, 150)))
        })
        check('the runtime it imports is put in the import map', function () {
          // the compiler wrote that import, not the user, so nothing but reading
          // the compiled output would find it
          var built = buildPreviewDoc({ code: '<div id="root"></div>', js: js },
            { lang: 'html', js: true, css: false })
          return ok(built.html.indexOf('"react/jsx-runtime":"https://esm.sh/react/jsx-runtime"') > -1 &&
            built.html.indexOf('type="module"') > -1,
            'map has the runtime=' +
            (built.html.indexOf('"react/jsx-runtime"') > -1) +
            ', module=' + (built.html.indexOf('type="module"') > -1))
        })
        check('nothing is reported about a runtime that only exists at run time', function () {
          return ok(!rowSaying('Cannot find module') && !rowSaying('Will not compile'),
            consoleRowsText().join(' | ') || 'nothing said, rightly')
        })
      })
      .then(function () {
        // What the editor itself thinks. This is the check that earns the .tsx
        // uri: on the inmemory uri monaco invents, the same JSX reports a fistful
        // of syntax errors while compiling it succeeds.
        var ed = TABS.js.get() || ensureJsEditor()
        ed.getModel().setValue(COMPONENT)
        var uri = ed.getModel().uri
        return monaco.languages.typescript.getTypeScriptWorker()
          .then(function (get) { return get(uri) })
          .then(function (client) { return client.getSyntacticDiagnostics(uri.toString()) })
          .then(function (diagnostics) {
            check('the editor does not underline valid jsx', function () {
              return ok(diagnostics.length === 0 && /\.tsx$/.test(uri.path),
                'the pane is ' + uri.toString() + ' and reported ' +
                diagnostics.length + ' syntax errors')
            })
          })
      })
      .then(function () {
        // Lines move a long way under JSX: six lines of markup collapse into one
        // call. The throw is on line 10 of what was written.
        setPaneText('js', COMPONENT)
        clearConsole()
        runPreview()
        return waitFor(function () { return !!rowSaying('thrown under jsx') }, 25000)
      })
      .then(function (spoke) {
        check('a throw below collapsed jsx is still reported on the line it is on', function () {
          var row = rowSaying('thrown under jsx')
          return ok(spoke && !!row && whereOf(row) === 'ts:10',
            row ? 'reported at ' + whereOf(row) + ' (want ts:10)'
                : 'never arrived: ' + consoleRowsText().join(' | '))
        })
      })
      .then(function () {
        // end to end: react itself, fetched through the map, rendering a component
        setPaneText('js', [
          'import { createRoot } from "react-dom/client"',
          'const App = () => {',
          '  console.log("JSX COMPONENT RAN")',
          '  return <h1>hello from jsx</h1>',
          '}',
          'createRoot(document.getElementById("root")).render(<App />)',
        ].join('\n'))
        clearConsole()
        runPreview()
        return waitFor(function () { return !!rowSaying('JSX COMPONENT RAN') }, 30000)
      })
      .then(function (spoke) {
        check('react renders a jsx component in the preview', function () {
          return ok(spoke, spoke ? 'the component function ran, so react arrived and called it'
                                 : 'it never ran: ' + consoleRowsText().join(' | '))
        })
      })
      .then(function () {
        // In the plain javascript flavour there is no compile step, so JSX cannot
        // work. It must fail loudly rather than quietly doing nothing.
        setJsLang('javascript')
        setPaneText('js', 'const el = <h1>no compiler here</h1>\nconsole.log(el)')
        clearConsole()
        runPreview()
        return waitFor(function () { return consoleRowsText().length > 0 }, 15000)
      })
      .then(function () {
        check('jsx without the typescript flavour fails loudly, not silently', function () {
          var said = consoleRowsText().join(' | ')
          return ok(/unexpected token|syntaxerror/i.test(said), said || 'it said nothing at all')
        })
      })
      .then(function () {
        var realConfirm = askYesNo
        askYesNo = function () { return true }
        return removeProject()
          .then(function () { askYesNo = realConfirm })
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
    var realConfirm = askYesNo
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
        askYesNo = function () { return true }
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
        askYesNo = realConfirm
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
    var realConfirm = askYesNo
    var asked = []
    askYesNo = function (msg) { asked.push(msg); return false }

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
        askYesNo = function () { return true }
        return openLaunchedFiles([fakeHandle('page.html', '<h1>from the desktop</h1>')])
      })
      .then(function () {
        check('a launch opens the file once replacing is allowed', function () {
          return ok(contentOf('main') === '<h1>from the desktop</h1>' &&
            !!fileHandles.main && document.title === 'page.html - QuickCode',
            'main=' + JSON.stringify(contentOf('main')) + ' title=' + JSON.stringify(document.title))
        })
        askYesNo = realConfirm
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
        check('the load that migrates leaves the old keys alone', function () {
          // one load of grace: the session that writes the new copy is never
          // the one that deletes the old
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

      check('the second load clears the old keys, now the work has come back out', function () {
        var left = LEGACY_CONTENT_KEYS.filter(function (k) { return localStorage.getItem(k) !== null })
        return ok(left.length === 0,
          left.length ? 'still on disk: ' + left.join(', ') : 'all three gone')
      })

      // The other half of being idempotent, and the one that matters after
      // someone has been using it. The old keys are deliberately put back for
      // this: what has to stop deleted work coming back is the migration guard,
      // not the keys happening to be absent by now.
      //
      // The queued write is cancelled and the open record dropped first,
      // because otherwise a flush lands mid-delete and puts it straight back -
      // which is what a fresh load looks like anyway.
      cancelFlush()
      project = null
      localStorage.setItem('code', '<h1>from the old store</h1>')
      Promise.all(all.map(function (p) { return deleteProject(p.id) }))
        .then(openWorkspace)
        .then(function (fresh) {
          check('deleting every project does not resurrect the old content', function () {
            return ok(fresh.code === '',
              'the new project came back holding ' + JSON.stringify(fresh.code))
          })
          check('and the key put back for that is cleared again', function () {
            return ok(localStorage.getItem('code') === null,
              'the old code key is ' + (localStorage.getItem('code') === null ? 'gone' : 'still there'))
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
    dialogChecks().then(storeChecks).then(emmetChecks).then(themeChecks).then(formattingChecks).then(themeFallbackChecks).then(fileHandleChecks)
      .then(pwaChecks).then(projectChecks).then(shareChecks).then(previewChecks).then(historyChecks).then(diffChecks).then(tsChecks).then(importChecks).then(jsxChecks).then(aiChecks).then(problemChecks)
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

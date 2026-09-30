// Runs in <head>, before any app script, so it can set up the storage state a
// case needs. Keep this free of assertions: it only arranges the world.

(function () {
  var CASE = window.__case

  var settings = function (over) {
    var base = {
      theme: 'vs-dark', lang: 'html', tab: 'main',
      js: false, css: false, vnav: false, split: false, splitLang: 'html',
    }
    localStorage.setItem('quickEdit', JSON.stringify(Object.assign(base, over || {})))
  }

  if (CASE === 'fresh' || CASE === 'persist-set') {
    localStorage.clear()
  }

  if (CASE === 'persist-check') {
    // deliberately seed nothing: the point is that the previous run's state
    // survives in the same browser profile
    return
  }

  if (CASE === 'preview-safe') {
    // the snippet reports in before trying to destroy anything, so a test that
    // passes because nothing ran is distinguishable from a real pass
    localStorage.setItem('code',
      '<h1>my important work</h1><script>' +
      'parent.postMessage("SNIPPET_RAN","*");' +
      'try { localStorage.clear(); parent.postMessage("STORAGE_WRITABLE","*") }' +
      'catch (e) { parent.postMessage("STORAGE_BLOCKED:" + e.name, "*") }' +
      '<\/script>')
    localStorage.setItem('css', 'body{color:teal}')
    localStorage.setItem('js', '// a library the user wrote')
    settings({ css: true, js: true })
  }
})()

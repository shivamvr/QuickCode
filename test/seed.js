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
    // The content is written by the probe, not here: it lives in IndexedDB now
    // and this file has to stay synchronous. Only the settings are still a
    // localStorage read for the preview window.
    settings({ css: true, js: true })
  }

  if (CASE === 'migrate') {
    // exactly what an install from before the project store looks like on disk
    localStorage.clear()
    localStorage.setItem('code', '<h1>from the old store</h1>')
    localStorage.setItem('css', 'h1 { color: rebeccapurple }')
    localStorage.setItem('js', 'console.log("old")')
    settings({ lang: 'html', tab: 'css', css: true, js: true })
  }
})()

# 06 — Preview console and errors

**Size:** M · **Depends on:** 01 · **Status:** not started

## Why

When a snippet throws, nothing happens that you can see. The preview is a
separate tab, so a runtime error and every `console.log` land in *that* tab's
devtools — which you are not looking at, because you are in the editor. For a
playground this is the difference between "it doesn't work" and "line 12 is
undefined".

Two related annoyances disappear at the same time:

- The preview is a second tab you have to arrange next to the editor. An in-page
  pane is what people expect from a playground.
- `app.html` reloads the entire preview whenever the snippet has a `<script>` or
  the JS pane is on ([app.html:78](../app.html#L78)), so you watch it flash.

## What changes

- `index.html` — a preview pane inside `#editor`, and a console panel
- `scripts/index.js` — `openWin()` becomes "open in a tab" (kept) alongside the
  new inline pane
- `app.html` — may end up unused for the inline case; keep it for the popped-out
  tab

## Approach

Item 01 already puts the snippet in a sandboxed `srcdoc` iframe. Extend the
document it builds with a small prelude that forwards console output and errors
to the parent:

```js
const PRELUDE = `<script>
(function () {
  var send = function (kind, args) {
    parent.postMessage({ __qc: true, kind: kind, args: args }, '*')
  };
  ['log','warn','error','info','debug'].forEach(function (k) {
    var orig = console[k];
    console[k] = function () {
      try { send(k, Array.prototype.map.call(arguments, String)) } catch (e) {}
      return orig.apply(console, arguments)
    }
  });
  window.addEventListener('error', function (e) {
    send('error', [e.message + '  (line ' + e.lineno + ', col ' + e.colno + ')'])
  });
  window.addEventListener('unhandledrejection', function (e) {
    send('error', ['Unhandled promise rejection: ' + String(e.reason)])
  });
})();
<\/script>`
```

In the parent, filter hard — the page receives messages from anywhere:

```js
window.addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow) return   // only our frame
  const d = e.data
  if (!d || d.__qc !== true) return
  appendToConsole(d.kind, d.args)
})
```

`e.origin` is `"null"` for a sandboxed frame, so **identity must be checked via
`e.source`**, not origin. That is the one non-obvious part.

### Line numbers

`e.lineno` is relative to the generated document, not to the HTML pane. To make
it useful, record how many lines the prelude and any wrapper add, and subtract
that offset before display. Get this right or the numbers are actively
misleading — worse than showing none.

### Auto-run

Rebuild the `srcdoc` on a debounce (~300ms) instead of reloading. Keep an
explicit Run action too: an infinite loop in a snippet will hang the frame, and a
manual trigger plus a "the preview stopped responding" escape hatch is kinder
than auto-running a `while(true)` on every keystroke.

## Verification

- `console.log('x', 1, {a:1})` in the JS pane appears in the panel with all
  three arguments.
- `throw new Error('boom')` shows the message and a line number that matches the
  line in the **editor**, not the generated document.
- An unhandled promise rejection is reported.
- A `postMessage` from an unrelated window or a different iframe is ignored.
- Editing a pane updates the preview without the whole frame flashing.
- The popped-out tab (`openWin`) still works.

## Risks

- **Message spoofing** — any page can `postMessage` to yours. The `e.source`
  check plus the `__qc` marker is the whole defence; do not skip it.
- Infinite loops still lock the frame. Consider a Stop button that swaps
  `srcdoc` for an empty document, which kills the running script.
- Console output can flood the DOM. Cap the panel at a few hundred entries.
- Serialising arbitrary values across `postMessage` fails on functions and
  cyclic objects; `String(...)` above is deliberately lossy but safe. Anything
  richer needs real care.

## Done when

A thrown error and a `console.log` both appear in an in-page panel with an
editor-relative line number, edits refresh the preview without a full reload, and
messages from other windows are ignored.

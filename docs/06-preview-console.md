# 06 — Preview console and errors

**Size:** M · **Depends on:** 01 · **Status:** done (see Outcome)

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

## Outcome

**Done, September 2026.** The preview runs beside the editor with a console
under it, and an error names the line in the editor rather than a line of the
document QuickCode generated.

### What was built

- **`scripts/preview.js`** - one builder for both previews, so the pane and the
  popped-out tab cannot drift apart. It returns `{ html, sources }`, where
  `sources` says where each pane's own text begins in the generated document.
- **The preview is the fourth tab of the split view.** That was the cheapest
  good answer: it inherits the drag handle, the remembered ratio, the show/hide
  and the per-project split state that the editor panes already had, and it adds
  no new layout concept. `app.html` stays exactly as it was for the popped-out
  tab.
- **`scripts/index.js`** - the controller: debounced rebuild, run and stop, the
  console panel, and the message handler.

### Line numbers, which the plan said to get right or not do at all

Measured rather than assumed. A quick experiment in headless Chrome settled the
two facts the design rests on:

- **`//# sourceURL` changes the reported `filename`, not the reported line.** So
  it is worth adding - it says *which pane* an error came from - but it does not
  renumber anything.
- **`lineno` is relative to the whole generated document.** Every line injected
  above the user's code moves it.

So the builder follows one rule: **nothing injected above the user's code
carries a newline**. The prelude is a single line. Everything that does have
newlines - their css, the js pane - is appended *after* their markup, and where
it starts is measured as the document is built rather than guessed. A whole
document from the editor comes through completely unmoved, so its lines are its
own.

The test that guards this compares the built document against the source: the
line a marker sits on in the user's text must equal the line it sits on in the
output, and each recorded start must really be where that pane's code begins.
An earlier version of the check only exercised the mapping, and a newline
injected above the user's code sailed straight past it.

### Two bugs found on the way

**Escaping the html pane broke inline scripts.** The css and js panes are
escaped because they are inlined *into* a style or script tag, where a closing
tag would break out. The html pane is markup and must go in as written - it got
the same treatment for a moment, and every script inside a snippet stopped
closing. The preview-safety case caught it immediately.

**`app.html` could paint a stale preview over a fresh one.** Two reads overlap
every time that page opens - the first starts before anything has been written -
and IndexedDB reads can finish out of order, so the older answer could land
last. Reads are now numbered and a stale one is discarded. This showed up as a
one-in-four test flake; fixing it took that case from 5-15 seconds down to a
steady 0.6.

### Message safety

`e.origin` is the string `"null"` for a sandboxed frame and proves nothing, so
identity comes from `e.source !== frame.contentWindow`, with the `__qc` marker
as a second gate. Console rows are written with `textContent`, never
`innerHTML`: this is output from code we did not write. The panel is capped at
300 rows.

### Verification

`node test/run.js` - **105 checks**, all passing. The new ones cover console
output with every argument, a thrown error and an unhandled rejection, the
editor-relative line for both an inline script in the html pane and the js pane,
errors marked as errors, a spoofed message from the page itself and from another
frame being ignored, editing refreshing in place, stop emptying the frame and
staying stopped, run starting it again, and a restored session coming back with
the preview showing.

Mutation-checked: a newline injected above the user's code, and dropping the
`e.source` check, each turned the suite red.

### Not done

- **The popped-out tab has no console of its own.** It is a separate window with
  its own devtools, and the messages the prelude sends there go nowhere. Worth
  doing only if anyone actually uses that window as their main preview.
- **An infinite loop still hangs the frame** until stop is pressed. A real fix
  means running the snippet in a worker, which is a different item.

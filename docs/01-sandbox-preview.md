# 01 — Sandbox the preview

**Size:** S · **Depends on:** nothing · **Status:** done (see Outcome at the end)

## Why

The preview runs on the **same origin as the editor**, so previewed code has
full access to the storage that holds your work. This is not theoretical — it
was reproduced in a headless browser by putting `localStorage.clear()` inside an
HTML snippet and previewing it:

```
localStorage after preview -> code=null   css=null   js=null
settings survived: false
```

Every file and every setting, gone, with no undo because the storage *is* the
save file. Any pasted snippet that touches `localStorage` — deliberately or by
accident, e.g. a tutorial snippet demoing storage — destroys the project.

Two lesser problems come from the same design:

- `app.html` is a second browser tab kept in sync through the `storage` event,
  and it calls `window.location.reload()` whenever the snippet contains a
  `<script>` or the JS pane is enabled ([app.html:78](../app.html#L78)). Every
  keystroke that reaches storage can reload the whole preview.
- [`openWin()`](../scripts/index.js#L328) uses `document.write` into a blank
  window for javascript and plaintext mode, which is legacy and unsandboxed too.

## What changes

- `app.html` — becomes a **host page** that renders the snippet into a sandboxed
  iframe, instead of injecting it into its own DOM.
- `scripts/index.js` — `openWin()` builds the document and hands it over.

Nothing else needs to move. Keep the second-tab workflow for now; item 06
replaces it with an in-page pane.

## Approach

Build the whole preview document as one string and put it in a sandboxed iframe
with `srcdoc`. With `allow-scripts` but **not** `allow-same-origin`, the frame
gets an opaque origin: its `localStorage` access throws or is a separate empty
store, and it cannot reach the parent's.

```js
// app.html
const buildDoc = () => {
  const s = readSettings()
  const css = s.css ? `<style>${read('css')}</style>` : ''
  const js  = s.js  ? `<script>${read('js')}<\/script>` : ''
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${css}</head>` +
         `<body>${read('code')}${js}</body></html>`
}

const frame = document.getElementById('preview')
frame.setAttribute('sandbox', 'allow-scripts allow-modals allow-forms allow-popups')
frame.srcdoc = buildDoc()
```

Notes that matter:

- **Do not add `allow-same-origin`.** Combined with `allow-scripts` it lets the
  frame remove its own sandbox, defeating the whole point.
- Setting `srcdoc` gives a fresh document, so inline `<script>` tags in the
  user's HTML run naturally. This **deletes** the `#myscript` / `#myscript2`
  copy-into-a-live-script-tag workaround
  ([app.html:53-61](../app.html#L53-L61)) and the `reload()` call, because a new
  `srcdoc` is already a clean run.
- Debounce the `storage` handler (~200ms) so a burst of writes rebuilds once.
- `openWin()` for javascript/plaintext mode can use the same host page with a
  query flag, or keep its own window but write the document into a sandboxed
  iframe rather than via `document.write`.

## Verification

Re-run the hostile-snippet test — it is the acceptance criterion:

1. Seed `code` with `<h1>work</h1><script>localStorage.clear()<\/script>`, plus
   non-empty `css` and `js`, and a `quickEdit` object.
2. Load the preview.
3. Assert `localStorage.getItem('code')` etc. are **unchanged**, and that
   `quickEdit` still parses.

Also confirm still working, since this rewrites how the snippet is executed:

- an inline `<script>` in the HTML pane runs
- the JS pane runs when its checkbox is ticked, and does not when unticked
- the CSS pane applies when ticked, and does not when unticked
- a snippet with `<html>`/`<head>`/`<body>` still renders
- editing any pane updates the preview without a full reload

## Risks

- **Silent behaviour change:** code that relied on same-origin access (reading
  the parent, using `localStorage` as scratch space) stops working. For a
  playground that is the intent, but it is a real difference from today.
- `sandbox` also blocks top-level navigation and some popup patterns. Add
  `allow-popups` / `allow-modals` as above so `alert` and `window.open` demos
  keep working.
- Anything in the snippet that needs a real origin (service workers, some
  `crypto.subtle` paths, `fetch` to relative URLs) will not work in an opaque
  origin. Document this rather than widen the sandbox.

## Done when

A snippet containing `localStorage.clear()` previews and renders, and the three
saved files plus settings are provably untouched afterwards — with the four
behaviour checks above still passing.

## Outcome

Implemented as planned. `app.html` is now a host page whose only job is to build
a document and hand it to a sandboxed frame; `openWin()` is four lines and every
language goes through the same path, so `document.write` into a same-origin
`about:blank` is gone.

Verified in headless Chrome across eight scenarios:

| Case | Result |
|---|---|
| Hostile snippet (`localStorage.clear()`) | ran, then **SecurityError**; all three files and settings intact |
| Inline `<script>` in the HTML pane | executes |
| CSS/JS toggles off | neither tag emitted, JS does not run |
| CSS/JS toggles on | both emitted, JS runs |
| Full document with `<body class="x">` | one `<html>`, not nested; style into its head, script into its body |
| `javascript` language mode | runs |
| `plaintext` mode | escaped correctly (`a &amp; b &lt;tag&gt;`) |
| Literal closing script tag in the JS pane | neutralised to `<\/script>`, snippet still runs, no breakout |

The frame reports `origin=null`, and `frame.contentDocument` is unreachable from
the host, which is what makes the isolation real rather than nominal.

### Two things worth remembering

- **A comment containing a literal closing script tag broke the whole file.** The
  HTML parser ends a script element at the first such sequence, even inside a
  `//` comment, so the inline script was truncated mid-comment and threw
  `SyntaxError`. Nothing ran, and the first test run therefore "passed" because
  no code executed at all. Any future edit to this file must avoid spelling those
  tags out in prose.
- **Snippets can no longer use `localStorage`.** That is the point, but it is a
  real behaviour change: a tutorial snippet demoing web storage now throws
  `SecurityError` instead of working. Worth a line in the README if it surprises
  anyone.

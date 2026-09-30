# 08 — Format on save

**Size:** S · **Depends on:** nothing · **Status:** done (see Outcome)

## Why

There is no formatter. Monaco ships formatting providers for HTML and CSS but
they are weak, and there is none for JS beyond basic indentation. For a
playground where code arrives pasted from anywhere, one keystroke to tidy it up
is a disproportionate payoff for the work.

## Approach

Prettier publishes standalone browser builds that need no bundler, which suits
this project's no-build rule. Load the standalone plus only the parsers needed:

```html
<script src="https://unpkg.com/prettier@3/standalone.js"></script>
<script src="https://unpkg.com/prettier@3/plugins/html.js"></script>
<script src="https://unpkg.com/prettier@3/plugins/postcss.js"></script>
<script src="https://unpkg.com/prettier@3/plugins/babel.js"></script>
<script src="https://unpkg.com/prettier@3/plugins/estree.js"></script>
```

Register it as a real monaco formatting provider, so `Alt+Shift+F`, the context
menu and format-on-save all route to the same place:

```js
const PARSERS = { html: 'html', css: 'css', javascript: 'babel', json: 'json' }

Object.entries(PARSERS).forEach(([language, parser]) => {
  monaco.languages.registerDocumentFormattingEditProvider(language, {
    async provideDocumentFormattingEdits(model) {
      const text = await prettier.format(model.getValue(), {
        parser, plugins: prettierPlugins,
      })
      return [{ range: model.getFullModelRange(), text }]
    }
  })
})
```

Note `prettier.format` is **async** in Prettier 3 — returning a promise from the
provider is fine, but do not write it as if it were synchronous.

Then wire it into the existing action set in `addAction()`
([scripts/eventListener.js:147](../scripts/eventListener.js#L147)), which is
already the one place editor actions are registered:

```js
e.addAction({
  id: 'formatDocument', label: 'Format Document',
  keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KEY_F],
  contextMenuGroupId: 'navigation', contextMenuOrder: 1.7,
  run: () => e.getAction('editor.action.formatDocument').run()
})
```

Watch the keybinding: `Ctrl+Shift+F` is already taken by fold-all, and menu
orders 1.1–1.6 are in use. Use 1.7 and a free chord.

**Loading cost.** Those five scripts are not small. Load them lazily on first
format rather than on every page load — the AMD loader pattern from item 03 or a
dynamic `import()` both work. Do not add them as blocking tags in `<head>`.

## Verification

- Format badly-indented HTML, CSS, JS and JSON; each uses the right parser.
- A **syntax error does not destroy the buffer** — Prettier throws, and the
  editor content must be left exactly as it was, with the error surfaced rather
  than swallowed.
- Undo after formatting restores the previous text in one step.
- Formatting a 2000-line file does not freeze the UI noticeably (if it does, move
  Prettier into a worker).
- The page still loads with the network blocked after the first use (interacts
  with item 03's caching).

## Risks

- Prettier's own bundle size is the main cost; lazy-load it.
- Reformatting the whole document via one `full range` edit collapses the undo
  stack into a single entry. That is the usual behaviour and desirable, but be
  aware it interacts with the `syncValue()` guard used for split-pane syncing.

## Done when

`Alt+Shift+F` formats all four languages correctly, a syntax error leaves the
buffer untouched, and Prettier is not fetched until first use.

## Outcome

Done. Prettier 3 is registered as real monaco formatting providers for html,
css, javascript and json, so the context menu, `Alt+Shift+F` and
`editor.action.formatDocument` all take the same path. It is fetched on first
use, not on page load.

### The trap worth recording

The plan said to load `standalone.js` and the UMD plugin builds. That **does not
work here**: monaco's AMD loader defines `define.amd`, so a UMD script loaded
afterwards registers as an anonymous AMD module instead of creating its global,
and `prettier` comes back `undefined`. Formatting then silently does nothing.

Worse, the first test run hid it: monaco has a *built-in* HTML formatter, so
"html is reformatted" passed while prettier was never loaded at all. Only the
javascript case exposed it, because monaco has no built-in JS formatter.

The fix is the ESM build with dynamic `import()`, which ignores AMD entirely.
The suite now checks that prettier itself resolves, and asserts on javascript
formatting specifically for the reason above.

A syntax error returns no edits, leaving the buffer exactly as it was - also
covered by a test.

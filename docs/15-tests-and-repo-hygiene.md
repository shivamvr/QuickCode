# 15 — Tests and repo hygiene

**Size:** M · **Depends on:** nothing · **Status:** not started

## Why

Nothing in this roadmap is safe to do twice without it. Concrete evidence from
the work already done on this codebase:

- A first-load crash meant **every custom shortcut and context-menu action
  silently failed to register** on a fresh browser. It survived many commits
  because the app looks fine once localStorage is populated.
- Themes `ayudark` and `dracula` 404'd on any case-sensitive host — fine on
  Windows, broken on GitHub Pages.
- Mid-refactor, a temporal-dead-zone bug (a `const` declared below its first use)
  aborted the rest of `index.js` and broke 13 behaviours at once. A test caught it
  immediately; reading the diff had not.
- Item 09 will silently kill all 8 keybindings if the `KeyCode` renames are
  missed, while leaving the context menu working.

Every one of these is invisible to inspection and obvious to a smoke test.

## Approach

Keep it proportionate: no framework, no npm install, one command. The pattern
that already works on this project:

1. A tiny static file server.
2. Headless Chrome pointed at an instrumented copy of the app.
3. A probe script injected into the page that exercises the real functions and
   `POST`s a pass/fail report back to the server.
4. The runner prints the report and exits non-zero on any failure.

Suggested shape:

```
test/
  run.js          # serve + launch chrome + collect + exit code
  serve.js        # static server with a /report endpoint
  probe.js        # the assertions, injected into the page
  README.md       # how to run it
```

`node test/run.js` and nothing else.

### What to assert first

Cover the things that have actually broken, not everything:

- **Fresh browser, empty storage:** no uncaught errors, and all 8 editor actions
  resolve *and* their keybindings are bound.
- **Persistence:** set theme, tab, split state, nav layout and all three files;
  reload; confirm every one restored.
- **Every theme file loads** — iterate the dropdown's `data-type` values and
  assert HTTP 200 from a **case-sensitive** server. This is the one that catches
  the GitHub Pages class of bug, so the test server must not be
  case-insensitive like a naive Windows `fs.readFile`.
- **Storage batching:** N keystrokes produce zero synchronous writes, and
  `flushStorage()` makes the text readable.
- **Lazy editors:** only the main editor exists at boot; each other appears when
  its tab opens.
- **Language and tab switching** across all values without exceptions.
- **Export** produces a single non-nested HTML document with css and js linked.
- **Preview isolation** (after item 01): the hostile-snippet test.

### Gotchas learned the hard way

- Assert against the **in-memory** settings object, not `localStorage`, or
  batched writes make tests fail spuriously.
- Monaco's own DOM contains many `aria-*` and `tabindex` attributes. Any
  DOM-counting assertion must exclude `.monaco-editor` subtrees.
- `editor.getSupportedActions()` does **not** list actions added via
  `addAction()`. Use `editor.getAction(id)`.
- Chrome's `--dump-dom` can exit before an async probe finishes. Either report
  synchronously at end of body, or have the page `POST` its own results.
- The AMD loader injects `editor.main.js` itself, so "is it loaded as a blocking
  tag" must be checked against the served **source**, not the live DOM.

## Repo hygiene

While in here:

- **`.gitignore`** — there is none.
- **LICENSE** — the README invites people to clone it; without a licence they
  formally cannot.
- **`jszip-utils.js` is gone** but confirm nothing references it.
- Consider a `.editorconfig`: the project is CRLF with mixed indentation, and a
  formatter has already reflowed `styles/style.css` once.

## Verification

- `node test/run.js` passes on a clean checkout and exits 0.
- Deliberately reintroduce a known bug (rename a theme file's case, or a
  `KeyCode` constant) and confirm the suite fails and names it.
- The suite runs from a clean browser profile every time — no leaked state
  between runs.

## Done when

One command runs the suite, it exits non-zero on failure, and it catches at least
the four historical bugs listed at the top when they are reintroduced.

# 15 — Tests and repo hygiene

**Size:** M · **Depends on:** nothing · **Status:** done (see Outcome)

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

## Outcome

`node test/run.js` runs 23 checks across three scenarios and exits non-zero on
failure. Four files, no dependencies: `run.js` (orchestrator), `serve.js`
(case-sensitive server that injects the probes as it serves), `seed.js`
(per-case storage state), `probe.js` (the assertions). Full notes in
[test/README.md](../test/README.md).

Also added `.gitignore` and `.editorconfig`. **LICENSE was deliberately not
added** — it needs a copyright holder name, and guessing one is worse than
leaving it to the owner.

### Proven to bite

Both historical bugs were reintroduced and the suite failed, then passed again on
revert:

- theme filename case (`Dracula.json` → `dracula.json`) → `every offered theme
  resolves` FAIL
- monaco key rename (`KEY_Z` → `KeyZ`) → `every key constant the app names
  actually exists` FAIL

### Two corrections this work forced

- **`KeyMod.Alt | undefined` is `512`, not `NaN`.** The plan above and
  [09-monaco-upgrade.md](09-monaco-upgrade.md) both claimed otherwise. Bitwise OR
  coerces `undefined` to `0`, so a renamed constant produces a valid-looking
  number silently bound to the wrong key. The first two versions of this check
  passed while the binding was broken; it now verifies the constant *names*
  resolve against the loaded build. 09 has been corrected.
- **A real bug fell out of writing the persistence test.** `settheme()`'s
  `.catch` used to persist `vs-dark` over the stored theme, so any transient
  failure — including the fetch being cancelled because the user reloaded right
  after picking a theme — permanently reset their choice. It now falls back for
  the session only and leaves the stored preference alone.

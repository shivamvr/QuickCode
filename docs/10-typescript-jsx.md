# 10 — TypeScript, JSX and Sass

**Size:** L · **Depends on:** 01, 09 · **Status:** TypeScript and JSX done; Sass dropped (see Outcome)

## Why

The language dropdown offers `plaintext`, `html`, `css`, `javascript` and `json`.
Monaco already understands TypeScript well enough to highlight and check it, but
the preview can only execute plain JS — so TS or JSX can be edited and never run.
A transpile step opens the tool to how a lot of code is actually written now.

## Approach

`esbuild-wasm` runs in a worker and compiles TS, TSX and JSX fast enough to feel
instant on snippet-sized input. It is the pragmatic choice: Sucrase is smaller but
does less, Babel standalone is much slower.

```js
// once, lazily, on first use of a compiled language
await esbuild.initialize({ wasmURL: 'https://unpkg.com/esbuild-wasm/esbuild.wasm' })

const { code } = await esbuild.transform(source, {
  loader: 'tsx',          // or 'ts' | 'jsx'
  target: 'es2022',
  jsx: 'automatic',
})
```

Then feed `code` into the preview document item 01 builds, in place of the raw JS
pane contents.

## Where it is bigger than it looks

- **`TABS` assumes one language per pane.** `TABS.js.lang` is `'javascript'`
  ([scripts/index.js:84](../scripts/index.js#L84)) and drives both the monaco
  model language and the storage key. Supporting TS in the JS pane means
  separating "what monaco highlights it as" from "how the preview compiles it" —
  a new field on the table plus a per-project setting.
- **JSX needs a runtime.** `jsx: 'automatic'` emits imports from
  `react/jsx-runtime`, which only resolve once item 11 exists. Either depend on
  that, or use `jsx: 'transform'` with a configurable factory and let the user
  bring their own React.
- **Sass is a separate library** (the Dart Sass JS build), not part of esbuild.
  Treat it as an independent step — or skip it: plain CSS has nesting and custom
  properties natively now, which was most of the reason to reach for Sass.
- **Error reporting.** A compile error must surface in the console panel from
  item 06 with a line number that maps to the editor. Without that, this feature
  is worse than not having it.

## Recommendation

Split this into three. **TypeScript first** — no runtime needed, clear win. Then
decide whether JSX justifies item 11's complexity. Treat Sass as optional. Do not
attempt all three in one pass.

## Verification

- A TS snippet with types compiles and runs; emitted JS has types stripped.
- A type error shows in the console panel with an editor-relative line number and
  does not silently run stale output.
- Switching the JS pane between plain JS and TS preserves content and updates
  highlighting.
- Existing plain-JS projects are completely unaffected — no compile step on the
  default path.
- The wasm binary is not fetched until a compiled language is first selected.

## Risks

- esbuild-wasm is a multi-megabyte download. It must be lazy, and it interacts
  with item 03's offline caching — decide deliberately whether it is precached.
- `esbuild.initialize()` may only be called once per page; guard it or the second
  call throws.
- Highest chance of scope creep in the roadmap. The language model in `TABS` was
  built for exactly three fixed languages; be willing to stop and reshape that
  first rather than bolting compilation onto it.

## Done when

TypeScript in the JS pane compiles and runs in the preview, errors report with
usable line numbers, plain-JS projects are untouched, and nothing downloads until
a compiled language is chosen.

## Outcome

**TypeScript done, September 2026.** JSX and Sass deliberately not, which is what
this plan's own recommendation asked for: TypeScript first, then decide.

### The library, and why the plan's choice was turned down

The plan called for **esbuild-wasm**. It is not needed. Monaco already ships the
TypeScript compiler, and item 09 already precaches `tsWorker.js`, so:

```js
const getWorker = await monaco.languages.typescript.getTypeScriptWorker()
const client = await getWorker(uri)
await client.getEmitOutput(uri.toString())      // the javascript
await client.getSemanticDiagnostics(uri.toString())   // the type errors
```

That is the whole compiler. Against esbuild-wasm it wins on every count that
matters here:

- **Nothing is downloaded.** The plan listed a multi-megabyte wasm binary as a
  risk, and asked for a deliberate decision about precaching it. That decision
  disappears: there is nothing to precache and nothing to fetch lazily.
- **It works offline on the first try**, which a lazily-fetched wasm binary
  cannot. There is a check for exactly this in the `offline` case, where the
  server has been taken down: TypeScript still compiles.
- **`esbuild.initialize()` may only be called once per page** - a trap the plan
  named. Not applicable.
- **Type errors come for free.** esbuild strips types without checking them, so
  the plan's own requirement, that a type error reach the console with a line
  number, would have needed a second library on top.

What is given up is speed on large input, which a snippet-sized playground never
reaches, and esbuild's output quality, which does not matter for code that runs
once in an iframe.

### What was built

- **A per-project flavour.** `jsLang` is `javascript` or `typescript`, stored with
  the project, so one project can be TypeScript while another is not.
- **`langOf(id)`**, which is the reshape this plan insisted on. `TABS` had one
  fixed language per pane baked in; the js pane now has two, and everything that
  needs to know asks rather than reading the table's fixed answer. Switching
  retargets the model, so the text, the undo stack and the cursor survive.
- **A badge inside the js tab**, `js` / `ts`. Like the checkbox that was already
  in there, its click is stopped from reaching the tab it sits in.
- **Compile on the way to the preview**, at the one seam where the js pane's text
  becomes the preview's script - so `preview.js` did not change at all.
- **Diagnostics in the console panel**, replacing the previous report rather than
  stacking a row up per keystroke. A syntax error is fatal and runs nothing; a
  type error is said out loud and the javascript runs anyway.

### The line numbers

This is where most of the work went, and the plan was right that without it the
feature would be worse than not having it.

**Compile errors** are exact: a diagnostic carries a character offset, and the
model turns that into a line and column.

**Runtime errors** are the hard half. Stripping types deletes lines, so line 1 of
the generated javascript can be line 3 of what was written. The emitted source
map is decoded - only far enough to answer "which line", which is about thirty
lines of base64 VLQ - and the console reports the line that was written. Where
there is no mapping it reports no line at all, which is the rule `preview.js`
already follows: a confidently wrong line number is worse than none.

### Where it stops, on purpose

- **JSX** needs a runtime, and `jsx: 'automatic'` needs item 11 to resolve
  `react/jsx-runtime`. The decision the plan asked for is: not yet, and not
  before 11.
- **Sass** is a separate library and plain CSS has nesting and custom properties
  natively now, which was most of the reason to reach for it. Skipped.
- **The single-pane `javascript` language** is still javascript only. The flavour
  is the js pane's, in the three-pane html mode, which is what this plan
  described.
- **The popped out preview cannot compile** - it has no monaco. The editor window
  publishes its last good output to localStorage and that window uses it, but
  only when it belongs to the project on screen. With none published yet the js
  is left out rather than raw TypeScript being run, which would only throw.

### Verification

`node test/run.js` - **152 checks**, all passing. Fourteen are new: the source map
decoder reading deltas in both directions, a plain javascript project never being
compiled, types being stripped, the output not asking the preview for a map file
that does not exist, the compiled output reaching the popped out preview, a type
error on its own line with the code still running, a new report replacing the
last, a syntax error running nothing, a runtime error reported against the
TypeScript line rather than the compiled one, flavour switching keeping the text
and retargeting both panes, the badge not switching tabs, a project saved before
the setting existed not inheriting a flavour, the flavour coming back with its
project, and TypeScript still compiling with the network gone.

Mutation-checked, eight of them, all caught. Two are worth naming:

- **Dropping the sign bit from the VLQ decoder passed everything** at first. A
  compiled snippet only ever walks forwards through its source, so no fixture
  reached a negative delta. The decoder is now tested directly, on a mappings
  string that goes backwards.
- **Reading a record's settings without filling in the ones it predates** let a
  project saved before `jsLang` existed inherit the previous project's flavour.
  That was a real bug, found by writing the check for it: every settings read now
  goes through `settingsOf`, which fills in from the defaults first.

## Outcome: JSX

**Done, 1 October 2026**, after ~~11~~ made it possible. This plan said to decide
whether JSX justified item 11's complexity once TypeScript was in. It does, and
it cost almost nothing once the import map existed.

### How little it took

- **`jsx: ReactJSX`** in the compiler options. The automatic runtime, so a
  component needs no `import React`.
- **The compile model is `.tsx`**, not `.ts`.
- **The js pane's own model is `file:///quickcode/pane.tsx`** instead of the
  `inmemory://model/3` monaco would invent.

That last one is the only structural change, and it is the one worth explaining.

### Why the pane needs a named model

The TypeScript worker decides whether JSX is allowed **from the file extension and
nothing else**. On monaco's invented uri, valid JSX reports four syntax errors
while compiling the very same text succeeds - the editor and the compiler
disagreeing about what is in front of them. The mutation that removes the named
uri fails exactly there: *"the pane is inmemory://model/3 and reported 4 syntax
errors"*.

The uri is set once, at creation, and never changes. That is what keeps item 10's
promise that a flavour switch preserves the text, the undo stack and the cursor:
the model is retargeted, never replaced.

`.tsx` has two narrow costs, both accepted deliberately: `<T>value` as a type
assertion and `<T>(x: T) => x` as a generic arrow are ambiguous with a JSX tag, so
they need `value as T` and `<T,>(x: T) => x`.

### The join with item 11

The compiler writes `import { jsx as _jsx } from "react/jsx-runtime"` itself. The
scanner in item 11 reads the **compiled** output, so it finds that import without
knowing anything about JSX, and the import map resolves it to esm.sh like any
other package. Nothing had to be taught about React.

### Something written and then removed

An ambient declaration shim for `react`, `react/jsx-runtime` and
`react-dom/client` went in first, to stop TypeScript reporting a module it cannot
see. Removing it again changed nothing: all 148 checks still passed, because
`IGNORED_DIAGNOSTICS` already covers "Cannot find module" for **any** package, and
no react-specific shim could do that for `nanoid`. Two mechanisms for one job, so
the narrower one went. Worth recording as a thing that looked necessary and was
not.

### Verification

`node test/run.js` - **181 checks**, all passing. Seven are new: JSX compiling to
calls on the automatic runtime, the runtime import reaching the map, nothing being
reported about a module that only exists at run time, the editor not underlining
valid JSX, a throw below collapsed JSX still reported on the line it was written
on, React actually rendering a component in the preview, and JSX in the plain
javascript flavour failing loudly rather than silently.

Mutation-checked, three of them, all caught: dropping the `jsx` option, compiling
as `.ts`, and letting monaco invent the pane's model uri.

The suite's budgets were raised with it - the watchdog to 150s and the case
timeout to 240s - because it now fetches react and react-dom from a CDN. The
first run of these checks also spent 87 seconds waiting out three timeouts for one
silly reason: the preview only builds while its tab is showing, and the new case
never opened it.

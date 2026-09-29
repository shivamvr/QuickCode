# 10 — TypeScript, JSX and Sass

**Size:** L · **Depends on:** 01, 09 · **Status:** not started

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

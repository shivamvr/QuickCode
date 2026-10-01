# 11 — npm imports

**Size:** M · **Depends on:** 01 · **Status:** done (see Outcome)

## Why

A snippet cannot `import` anything. `import { debounce } from 'lodash-es'` fails,
because a bare specifier has no meaning in a browser without a bundler or an
import map. Every snippet is limited to one file plus whatever the user adds as a
manual `<script src>`.

## Approach

Two mechanisms, both worth having.

**1. An import map in the preview document** that item 01 builds:

```html
<script type="importmap">
{ "imports": { "lodash-es": "https://esm.sh/lodash-es" } }
</script>
```

Import maps are supported across browsers now. The snippet's own
`<script type="module">` resolves bare names against it.

**2. Auto-detect**, so the map is not maintained by hand:

```js
const BARE = /(?:^|\s)import\s[\s\S]*?from\s*['"]([^./][^'"]*)['"]/g
// plus dynamic import('...') and export ... from '...'
```

Resolve each to `https://esm.sh/<specifier>`, honouring a version the user wrote
(`lodash-es@4`). A regex will not catch every form — acceptable for a playground,
but do not present it as a real module resolver.

## Details that bite

- The snippet's script must become `type="module"`, which changes semantics:
  deferred execution, strict mode, its own scope. A snippet relying on top-level
  `var` leaking to `window` will break. Only switch to module type **when an
  import is actually detected**, so existing snippets are untouched.
- Modules inside a sandboxed `srcdoc` frame run at an opaque origin. Cross-origin
  module fetches from a null origin work because esm.sh serves permissive CORS,
  but verify this early — the whole feature rests on it.
- A typo'd package name currently fails silently. It needs a clear message in the
  console panel (item 06).
- Offline (item 03) and this feature are in direct tension: imports need the
  network. Say so in the UI rather than appearing broken.

## Verification

- `import { debounce } from 'lodash-es'` works in the preview.
- A pinned version (`lodash-es@4.17`) resolves to that version.
- A snippet with **no** imports still runs as a classic script, with top-level
  `var` behaviour unchanged.
- A nonexistent package produces a readable error in the console panel.
- Dynamic `import()` of a bare specifier resolves.

## Risks

- Third-party CDN dependency at preview time; if esm.sh is down, those previews
  break.
- The classic-script to module switch is a real behaviour change. Gate it on
  detection and test both paths.
- Arbitrary remote code runs in the preview. It is sandboxed after item 01, which
  is precisely why that item comes first.

## Done when

A bare import resolves and runs, version pins are respected, import-free snippets
keep their classic-script semantics, and a bad specifier reports clearly.

## Outcome

**Done, 1 October 2026.** `import confetti from "canvas-confetti"` works in the
js pane, with nothing in the html pane. This was the last item on the roadmap.

### The foundations, measured first

The plan said of module fetches from an opaque origin: *"verify this early - the
whole feature rests on it."* That was the right instruction, and the spike
answered four questions at once:

| | |
|---|---|
| A module in a sandboxed `srcdoc` frame can fetch from esm.sh | yes |
| A bare specifier resolves through an import map there | yes |
| `//# sourceURL` still names the pane when the script is a module | **yes** |
| `e.lineno` is still relative to the document in a module | **yes** |

The last two are the ones that mattered most. `preview.js` rules 2 and 3 - the
whole line-number machinery, which items 06 and 10 both built on - survive the
module switch untouched. Nothing about them had to change.

### What was built

- **`scripts/imports.js`.** A scanner that finds what a snippet imports, a
  resolver that points each name at esm.sh, and the preflight below.
- **An import map in the head**, one line, before any module - because anything
  above the user's code with a newline in it makes every reported line number
  wrong. It serves the html pane's own module scripts as well as the js pane's.
- **The module switch, gated on detection**, exactly as the plan insisted. A
  snippet with no imports is built as the same classic script it always was. One
  of the checks is specifically that a top-level `var` still reaches `window` on
  that path, because that is what would break first.

### The scanner, and what it is not

It is not a module resolver and does not claim to be. It blanks out strings and
comments first, keeping their contents in a side table, then matches the forms a
snippet writes: `import … from`, `import 'x'`, `export … from`, and `import()`.

Two things it gets deliberately right, because both change how a snippet runs:

- **The word `import` in a comment or a string is not an import.** Treating one as
  such would flip the snippet into module mode and break working code.
- **A regular expression holding a quote does not derail it.** `/['"]/` would
  otherwise read as the start of a string and swallow everything after it. The
  scanner tracks whether a slash is division or a pattern, including after
  keywords like `return`.

### The silence that forced a redesign

The plan noted that *"a typo'd package name currently fails silently."* It is
worse than that, and worth writing down: **a module whose import 404s reports
nothing whatsoever.** No `error` event, no `unhandledrejection`, nothing after
twelve seconds of waiting. The spike checked.

So the console cannot be told by the page - which means asking first, from the
editor window, where a failed fetch is visible. That turns the preflight from a
nicety into the only mechanism that can report E1 or E2 at all. It caches
successes so typing does not refetch, and deliberately does not cache failures,
so coming back online recovers on its own.

An **unmapped** bare specifier is the one case the browser does report, as a
resolve-time `TypeError` with `lineno: 0` - which `previewLocation` already turns
into "no line", rather than claiming line zero.

### Offline

Imports and item 03 are in direct tension, as the plan said. The resolution is to
say so plainly: *"you appear to be offline. Imports are fetched from esm.sh, which
needs a network; the rest of QuickCode does not."* A dead network and a missing
package get different messages, and there is a check for each.

### A bug this turned up in item 10

TypeScript reported **"Cannot find module 'nanoid'"** for every bare import. It is
right that it cannot find it - no node_modules, no declarations for something
fetched at run time - but it is a complaint about code that demonstrably works, so
it is now filtered.

Two details cost a run each. `setDiagnosticsOptions({ diagnosticCodesToIgnore })`
only suppresses the editor's own underlines; the worker still reports the
diagnostic to a direct caller, so the same list has to be applied again where the
diagnostics are read. And the code was **2792**, not the 2307 that looked obvious -
2792 is the variant that suggests setting `moduleResolution`.

### Verification

`node test/run.js` - **174 checks**, all passing. Twenty are new, at three levels:

- **The scanner** (5): every form found; an import only mentioned in a comment or
  a string not found; addresses left unmapped but still needing a module; a regex
  holding a quote not derailing it; pins, scopes and deep paths resolving.
- **The document** (5): no imports giving a classic script; imports giving a module
  with the map above it; the map being one line; the js pane still starting exactly
  where `sources` says; a specifier unable to close the map tag early.
- **Live, in the browser** (8): a bare, a pinned and a dynamic import all running;
  a throw inside a module still reported at the right js line; a top-level `var`
  still global without imports; a missing package saying so with its name and the
  status; nothing of that snippet running; TypeScript and imports together;
  TypeScript not complaining about what it cannot see; a pin resolving to that
  version at esm.sh.
- **Offline wording** (2): offline told apart from unreachable.

Mutation-checked, ten of them, all caught: not skipping comments, mapping
addresses, always a module, never a module, no map at all, an unescaped map tag,
no trailing-slash entries, never reporting a failed import, treating every slash
as division, and dropping 2792 from the ignore list.

One of those caught a bug in the **test** rather than the code: the first version
of the map-injection check looked for the hostile tag's text anywhere in the
document. It is there, inert, inside the map - which is the point. What would be a
hole is the map tag *ending* early, so the check now compares positions.

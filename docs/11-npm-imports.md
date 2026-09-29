# 11 — npm imports

**Size:** M · **Depends on:** 01 · **Status:** not started

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

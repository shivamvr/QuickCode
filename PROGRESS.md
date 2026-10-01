# Item 11 — npm imports: progress

Scratch file for tracking this item. Not meant for the repo — delete it when 11 is done.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked or changed plan

## A. Prove the foundations before building on them

The plan: *"verify this early — the whole feature rests on it."*

- [x] A1. A module inside a sandboxed `srcdoc` frame (opaque origin) can fetch from esm.sh
- [x] A2. A bare specifier resolves through an import map in that frame
- [x] A3. `//# sourceURL` still names the pane when the script is a module
- [x] A4. `e.lineno` is still document-relative for a module script

**A findings.** All four hold, so the line-number machinery survives the module
switch untouched. One more, unplanned and important: a module whose import
**404s reports nothing at all** - no error event, no rejection, nothing after 12
seconds. The parent can see it (`200` vs `404`), so a parent-side preflight is
the only way to report E1/E2 at all. It is not optional.

## B. Find the imports

- [x] B1. Scanner finds `import x from`, `import "x"`, `export … from`, `import()`
- [x] B2. A commented-out import does **not** count
- [x] B3. An import inside a string does **not** count
- [x] B4. Full URLs and relative paths are left alone, not mapped

## C. The import map

- [x] C1. One-line map in the head, before any module script (preview.js rule 2)
- [x] C2. Version pins resolve (`lodash-es@4.17`)
- [x] C3. Scoped packages and deep paths resolve (`@scope/pkg`, `lodash-es/debounce`)
- [x] C4. The html pane's own module scripts can use the map too

## D. Gate the module switch

- [x] D1. No imports → classic script, byte-for-byte as now
- [x] D2. Top-level `var` still reaches `window` on that path
- [x] D3. Imports present → `type="module"`

## E. Errors worth reading

- [x] E1. Offline + an import → a clear message naming the package, not the browser's
- [x] E2. A package that does not exist → a clear message
- [x] E3. Nothing stale runs when imports could not be fetched

## F. Keep what already works

- [x] F1. Line numbers still right in module mode, js pane
- [x] F2. Line numbers still right in module mode, html pane
- [x] F3. TypeScript and imports together
- [x] F4. The popped-out preview (app.html) gets the same treatment
- [x] F5. Existing 154 checks still pass

## G. Finish

- [x] G1. New checks in the suite
- [x] G2. Mutation-test each one
- [x] G3. `sw.js` updated if a file was added
- [x] G4. Docs: README, docs/11 Outcome, ROADMAP, test/README
- [x] G5. Full suite green twice

---

**All done, 1 October 2026.** 174 checks passing, ten mutations, all caught.

Two things found along the way that were not on this list:

- **A module whose import 404s reports nothing at all.** No error event, no
  rejection, nothing after twelve seconds. The parent-side preflight is the only
  reason E1 and E2 can say anything, and it went from "nice to have" to required.
- **TypeScript complained about every bare import** - "Cannot find module" - which
  is true and useless, since the import map fetches it at run time. Now filtered.
  The code was 2792, not the 2307 that looked obvious.

This was the last item on the roadmap.

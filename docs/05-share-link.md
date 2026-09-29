# 05 — Share links

**Size:** S · **Depends on:** 04 · **Status:** not started

## Why

The only way to get a snippet out of QuickCode today is to export a zip and send
the file. A URL that reproduces the editor state is the highest value per line of
code in this whole roadmap, and it needs **no backend** — the state rides in the
URL fragment, which is never sent to a server.

## Approach

`CompressionStream('deflate-raw')` is available across browsers now, so this
needs no library.

```js
const encodeState = async (project) => {
  const json = JSON.stringify({
    v: 1, code: project.code, css: project.css, js: project.js,
    lang: project.lang, cssOn: project.css_enabled, jsOn: project.js_enabled,
  })
  const stream = new Blob([json]).stream()
    .pipeThrough(new CompressionStream('deflate-raw'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  // base64url so it survives a URL fragment untouched
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
```

Decoding on load, before any editor is created:

```js
if (location.hash.startsWith('#s=')) {
  const project = await decodeState(location.hash.slice(3))
  // treat it as an unsaved scratch project, do NOT overwrite the active one
}
```

### Two decisions worth making deliberately

**Never overwrite the user's current project.** Opening a shared link should
create a new unsaved project, or load into a clearly-marked scratch state with a
"Save a copy" action. Silently replacing what someone was working on would be a
worse version of the bug item 01 fixes.

**Watch the length.** Browsers tolerate long URLs but chat apps and email
clients truncate. Deflate handles typical snippets in a couple of KB. Show the
length when copying, and warn past ~8 KB rather than producing a link that
silently breaks. A large project is what zip export is for.

## Verification

- Round-trip: encode a project with all three panes populated plus non-ASCII
  characters and emoji, decode it, and compare byte-for-byte.
- Open a share link while a project is already open: the existing project is
  still intact afterwards.
- A truncated or corrupt fragment shows a clear message and leaves the editor in
  a usable state — never a blank screen or an uncaught rejection.
- `#s=` with an unknown `v` is rejected politely (this is why `v: 1` is in the
  payload).

## Risks

- Anyone with the link sees the code. Obvious, but say so in the UI — people
  paste credentials into playgrounds.
- `String.fromCharCode(...bytes)` blows the call stack on large inputs. Chunk it,
  or use a loop, once payloads get big.
- Fragment-based state and the `storage`-event preview need to not fight: a
  shared link must not write to the shared storage keys until the user saves.

## Done when

A link reproduces code, styles, script, language and the two enable toggles in a
fresh browser profile, without touching any project already stored there.

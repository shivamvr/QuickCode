# 05 — Share links

**Size:** S · **Depends on:** 04 · **Status:** done (see Outcome)

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

## Outcome

**Done, September 2026.** A link reproduces the snippet, needs no backend, and
touches nothing that was already stored.

### What was built

- **`scripts/share.js`** - the codec, kept on its own because it is pure and
  worth testing directly: `encodeShare` / `decodeShare`, base64url both ways,
  `shareUrl`, `sharedFragment`.
- **`scripts/index.js`** - `importShared()` on the boot path and
  `copyShareLink()` behind a new row in the save dialog.
- **`index.html`** - one `<div id="share">` next to `export project`, styled by
  adding it to the rules `#export` already had. No new colours.

The payload is `{ v, name, code, css, js, lang, cssOn, jsOn }`, deflated and
base64url encoded. **The tab, split and ratio are deliberately not in it**:
those are how someone likes to sit at their own editor, not part of the snippet.

### Decisions the plan asked for, and what was decided

**Never overwrite the open project.** A link opens as **a new project of its
own**, named after the sender's with ` (shared)` appended. The plan offered
"a new unsaved project, or a clearly-marked scratch state with Save a copy" -
the first is better here, because projects exist now: the imported one shows up
in the picker, survives a reload, and can be deleted in one click, with no new
UI state and no scratch buffer that can be dropped without asking.

The fragment is cleared with `history.replaceState` after it is taken, so a
reload opens the imported project instead of importing a second copy of it.

**Say what the link costs.** The button reports the size, warns past 8 KB, and
says *anyone with it can read your code* - people do paste credentials into
playgrounds. Where the clipboard is unavailable or refused, the link goes into
the dialog's own text box, selected and ready to copy.

### Two details worth keeping

`String.fromCharCode(...bytes)` overflows the call stack around a hundred
thousand arguments, exactly as the plan warned, so the base64 encoder walks the
array in 32KB chunks.

A bad link never blocks the editor. `importShared` catches, keeps the reason,
and the message is shown from a `setTimeout` at the end of `initCore` - so the
editor is already on screen behind it rather than half-built.

### Verification

`node test/run.js` - **91 checks**, all passing, including a new **`share`
scenario**: `run.js` builds a link with **node's own zlib** and opens the page at
that URL. Nothing in the browser has seen that payload before, which is the only
way to prove the format is really deflate-raw rather than something Chrome
happens to round-trip with itself.

Also checked: a round trip byte-for-byte with emoji, CJK, tabs, CRLF and quotes;
the link is a fragment and nothing else; the project that was open is untouched;
the address bar is cleared; a corrupt link and a link from a future version are
both refused with a reason and no uncaught error; and the button itself produces
a link and says what it costs, through the no-clipboard fallback.

Mutation-checked: importing over the open project, dropping the version check,
and leaving the fragment in the address bar each turned the suite red.

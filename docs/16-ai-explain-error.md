# 16 — Explain this error

**Size:** M · **Depends on:** 06, 10, 11 · **Status:** done, except the live call (see Outcome)

## Why

The console panel knows more about an error than the person reading it does: the
message, which pane it came from, and the real line in that pane — which items
06, 10 and 11 each did work to keep accurate. That is most of a good question
already. An **explain** on an error row turns it into one.

It is the smallest AI feature that is genuinely useful, and the first one worth
building, because everything it needs already exists.

## The problem that comes first

QuickCode is static files with no backend, so there is nowhere to keep a secret.
A key has to live in the browser, which means it has to be the user's own key,
pasted in, stored locally, and sent nowhere but to the service answering.

## Outcome

**Done, 1 October 2026** — with one honest exception, below.

### Where the key lives: not in the browser at all

This went through three designs, and the third is much the simplest.

The first used the Anthropic SDK loaded from esm.sh, with the user's own key in
localStorage. The second swapped to plain `fetch` against any OpenAI-shaped
provider, Groq by default — which deleted the SDK, the CDN import, and the only
part of the path that could not be tested here.

The third removed the key from the browser entirely. **`netlify/functions/ai.mjs`
holds it**, read from the host's environment variables, and forwards the question
to Groq. The browser POSTs `{system, question}` to `/api/ai` and gets text back.

That is a smaller design *and* a safer one, and it deleted more than it added:

- no key dialog, no provider menu, no key in localStorage
- no "the key is never in a share link" protection, because there is no key to
  put in one. The check that replaced it is stronger and simpler: **the request
  carries nothing credential-shaped, and neither does this browser's storage.**
- no own-key path, which also means no local Ollama option. That went knowingly.

What it costs: the site can no longer be plain files on GitHub Pages if you want
AI, and the allowance is shared rather than per-person.

**Streaming went too, deliberately.** Server-sent-event parsing is a lot of code
for answers a few sentences long from a provider chosen partly for being fast.
Worth adding back if the answers get longer.

### Whatever went wrong, it says which thing

The function **passes the upstream status through** rather than flattening it. That
one decision is what lets the app distinguish five situations that need five
different responses from whoever is reading:

| | |
|---|---|
| 429 | today's shared allowance is spent — it resets tomorrow |
| 401 / 403 | the server's key was refused — not the reader's problem, tell the owner |
| 503 | no `GROQ_API_KEY` is set on this site at all |
| 404 **with** a reply from the function | the model has been withdrawn |
| 404 **without** one | there is no function here — the site is being served as plain files |
| 413 | too much code to send at once |

The mutation that flattens everything into a 500 breaks two checks at once, which
is the right amount of noise for a change that would make every message in the app
useless.

Two things were already safe and did not need changing:

- **The service worker never caches an API call.** It returns early on non-GET,
  and only caches same-origin plus two named vendor hosts. An API POST misses on
  both counts.
- **The AI endpoint is never cached.** It is a POST, which the worker ignores
  anyway; `/api/` is now excluded explicitly as well, so it stays true if it ever
  answers a GET.
- **The sandboxed preview cannot read the key.** The frame runs at an opaque
  origin, so a snippet someone pastes has no access to storage.

### The question

Built from what the row already carries: the message, the pane, the line, and
the three files with that line marked by an arrow. The numbers are the console's
own — the ones the editor is showing — which is the whole reason they are worth
sending.

The prompt names each pane **one** way throughout. The first version said "the
js pane" in the sentence and "the javascript pane" over the listing: the same
file under two names, in a question about which line is wrong.

### The answer

Streams into the console as it is written, in a row of its own, rendered with
`textContent`. A reply from a model is not markup this project wrote — the same
rule the console already holds to for the snippet's own output.

A refused key, a rate limit, a server error and no network each say something a
person can act on, rather than passing the raw message through.

### Nothing happens until someone asks

The SDK is imported on first use, not by a script tag: a few hundred KB that most
sessions never need. No key is asked for until the first question. There is a
check that the SDK module is still untouched after all of the above.

### The seam

`askClaude` is the one function the tests replace. Above it is building the
question, below it is the network — so both sides are checked without a key,
without a network, and without a bill for every run. This is the only way an AI
feature could be held to the same standard as the rest of the suite.

### The function is checked in node; the live call, once there was a key

The function runs on the host, so the browser suite cannot reach it. It is
imported and called directly in node instead, with `fetch` replaced —
`test/functions.js`, eleven checks, no key and no network. That covers the forward,
the status pass-through, the size cap, a GET, a non-JSON body, a dead upstream, and
a missing key.

**The hop to Groq was left untried for want of a key, and the first real request
with one failed.** It is worth writing down why, because the reason was not a bug
in anything above.

`llama-3.3-70b-versatile` was taken from Groq's own documentation, where it was
described as a current production model. Pointed at a live key it answered
**404 `model_not_found`** — withdrawn, with the documentation not yet caught up. A
`GET /openai/v1/models` with the same key returned eleven models and not one llama
chat model among them.

So the model is now chosen from what that call returned rather than from prose:
**`openai/gpt-oss-120b`**, 131k of context, and tried on both prompts before being
written down — an error explained in 721ms, a practice problem set in 3.3s, the
JSON parsing clean on the first attempt. The one thing worth knowing about it is
that it reasons before it answers and the thinking is charged against the same
budget as the reply, which is why `MAX_TOKENS` is 3000 rather than 2000.

The lesson is in the code as a comment: a model name in documentation is a claim
about the past. **The endpoint, the request shape, the key, the model and both
prompts are now confirmed against the real service.**

When it does fail — a withdrawn model again, a spent allowance — it fails into the
console with a message naming the cause, and each of those messages is checked.

### Verification

`node test/run.js` — **194 checks**, all passing. Thirteen are new: the key out
of the settings and out of the project, a share link unable to carry it, only
error rows offering an explanation, the question carrying the error and the pane
and the line and the code, one name per pane throughout, the arrow against the
right line, the reply arriving as it is written, the reply rendered as text and
never as markup, the three failure messages, a failure reaching the console
rather than being dropped, a second question while one is in flight being
ignored, cancelling the key dialog sending nothing, and the SDK still untouched.

Mutation-checked, seven of them, all caught: taking the settings into the share
payload, offering to explain every row, dropping the line marker, rendering the
reply as HTML, removing the one-at-a-time guard, asking with no key, and passing
the raw error through.

One of those found a bug in the **test** rather than the code: the fixture for
the markup check used `onerror=alert(1)`, and a modal dialog in this page has
nothing to dismiss it — so a vulnerable version **hung the run** instead of
failing it. The payload sets a flag now, and the failure reads
`payload ran=true`.

## Not done

- **A settings panel.** The key is asked for with a dialog, the way a snapshot
  name is. Emptying the box forgets it. A real settings row is the obvious next
  step if more than one thing needs configuring.
- **Anything per-keystroke.** Ghost-text completion is a different feature with
  different problems — latency, cancellation, and a request per pause rather
  than per click.

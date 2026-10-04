# 17 — AI practice problems

**Size:** M · **Depends on:** 04, 06, 16 · **Status:** done, except the live call (see Outcome)

## Why

A playground is a good place to practise, but you have to bring your own problem.
`+ AI practice problem` sets one: the statement as a comment, a stub to fill in,
and test calls whose results land in the console.

The console is already a test runner — it reports with the line numbers the
editor is showing — so nothing had to be built for the checking part.

## Outcome

**Done, 1 October 2026**, apart from the live request (below).

### Three decisions

- **It always makes a new project.** Nothing you are working on is touched, and
  the project picker becomes the list of problems you have been set. Item 04 gave
  this for free. The mutation that writes into the open project instead is caught
  by the check that the previous project is still byte-for-byte what it was.
- **A problem may use all three panes.** "Build a debounce visualiser" needs
  markup and css; "two sum" does not. The model is told to send empty strings for
  the panes a problem does not need, and the preview toggles follow what actually
  arrived — switching on a pane with nothing in it is its own mutation.
- **It opens on the preview**, because the first thing anyone does with a problem
  is run it.

### Reading a reply that will not always be what was asked for

The model is asked for one JSON object. It will sometimes fence it, sometimes say
"here you go" first, and occasionally stop halfway. The parser is deliberately
forgiving: fences off, first `{` to last `}`, and if that still will not parse,
**the whole reply becomes the js pane**. A problem written as plain javascript is
still a problem; an error message is not.

Two of the nine mutations survived the first time, and each pointed at something
real rather than a missing check:

- **Stripping code fences was doing nothing** on the JSON path — the brace scan
  already steps over a fence, like any other prose around the object. But the
  fallback path kept the reply *as it stood*, so a fenced plain-javascript answer
  would have put ``` markers into the editor. Fences now come off both paths, and
  the check that catches it is on the fallback.
- **The "stops halfway" fixture never reached `JSON.parse`.** It had no closing
  brace at all, so it was turned away by the brace scan first and the try/catch
  was never exercised. There are two broken fixtures now: one that fails before
  the parser and one that fails inside it.

### A message nobody sees is not a message

On the way to a new project the preview gets opened anyway, so a successful
problem is always visible. A **failed** request never gets that far — so it would
have written "today's allowance is spent" into a console panel that was not on
screen.

Failures now bring the console into view first. The check for it deliberately
switches the split pane to something else before failing, and the mutation that
removes it fails with `preview showing=false`.

### The live call, and what a real reply looks like

This was written with no key to hand, so for a while what was proven was the
question that would be sent, the shape it is sent in, and everything done with a
reply — and nothing in between. The model named in Groq's documentation turned out
to have been withdrawn; the story is in [16](16-ai-explain-error.md). The model is
now `openai/gpt-oss-120b`, chosen from a live model list.

**This prompt has been run against it.** "Set a problem about: array rotation" came
back in 3.3s as one JSON object, no fence, no preamble — so the tolerant parser had
nothing to be tolerant about, which is the case it should be good at. What arrived:

- `name` `"Array Rotation"`, four words or fewer as asked
- `js` 911 characters: the statement as a `//` block with constraints and a worked
  example, a `check(actual, expected)` helper that compares with `JSON.stringify`
  and logs PASS or FAIL, a `rotateArray(arr, k)` stub whose body is **only**
  `// your code here`, and four test calls including the empty array
- `html` and `css` empty strings, correctly, for a pure algorithm problem

The instruction that mattered most was **"do NOT solve the problem"**, and it was
obeyed. A model that helpfully fills in the stub would make the feature pointless,
so that is the one thing to re-check if the model is ever changed.

Since this was written the key moved to the server — see
[16](16-ai-explain-error.md) — so there is no key dialog here any more either. The
function that holds it is checked in node (`test/functions.js`), and the hop from
there to Groq is now confirmed as well.

### Verification

`node test/run.js` — **210 checks**, all passing. Fifteen are new: a clean JSON
answer becoming a problem, a fenced one and one with chatter parsing the same, an
answer that is not JSON at all still being kept, two shapes of broken JSON
falling back rather than throwing, a fenced non-JSON answer leaving no backticks
in the editor, the topic you type reaching the question, an empty topic asking for
anything, the problem arriving as a new project with the panes filled, landing on
the preview with the toggles matching, the previous project untouched, a problem
with no markup not switching on panes it does not use, an unusable answer setting
nothing, cancelling the topic asking nothing, a failed request reporting in the
console, and the project menu offering it at all.

Mutation-checked, nine of them, all caught: dropping the fence strip, throwing
instead of falling back, writing into the open project, switching every pane on,
not opening the preview, accepting an empty answer, ignoring a cancelled dialog,
dropping the menu action, and putting the key in the Gemini URL.

## Not done

- **Checking the solution with a model.** The console's PASS/FAIL from the
  generated tests is enough for now, and it costs nothing per run.
- **Difficulty as a control** rather than something you type. Free text is doing
  the job and needs no UI.

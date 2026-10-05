# 18 — One dialog of our own

**Size:** M · **Depends on:** 04, 06, 12 · **Status:** done

## Why

QuickCode asked sixteen questions through `prompt()`, `confirm()` and `alert()`.
They were the one place the application visibly stopped being itself: a grey
operating-system box, in the browser's font, pinned to the top of the window,
saying "localhost:8080 says".

It is not only how they look.

- They **cannot be styled or themed**, so they ignore the editor theme entirely.
- They **block the whole page** — the preview iframe, a save in flight, every
  pending timer — because they are synchronous.
- Browsers are **allowed to suppress them**, and do. A question nobody is asked
  returns `null` or `false`, which reads as "cancel", so the feature silently
  does nothing and no one finds out why.

## Outcome

**Done, 5 October 2026.** `scripts/modal.js`, 183 lines, replacing all sixteen.

Four calls cover every case:

```js
await askText(message, value)       // the string, or null if cancelled
await askLongText(message, value)   // the same, in a box worth pasting into
await askYesNo(message)             // true or false
sayProblem(message)                 // resolves once it has been dismissed
showBusy(message)                   // returns the function that takes it down
```

### The wording did not have to move

Every native message was already written as a headline, a blank line, and the
detail — `'Delete "' + name + '"?\n\nIts three files go with it…'`. So the
dialog takes the message whole and splits on the blank line: first paragraph
becomes the heading, the rest becomes the detail.

That one decision is why the diff at the call sites is almost entirely
`confirm(` → `await askYesNo(`. Sixteen pieces of wording crossed over
untouched, and none of them had to be re-reviewed.

### One function had to change shape

A dialog cannot return a value in the same turn, so everything that asks a
question became async. Thirteen of the sixteen callers already were.

The exception was `canReplace`, a plain arrow returning a boolean to
`openLaunchedFiles`:

```js
const canReplace = (id, name) => { … return confirm(…) }
```

It is now `async`, and its one caller awaits it. Worth naming because it is the
only place where the change is more than a renaming — and because the thing it
guards is overwriting unsaved work, which is the worst question in the app to
get wrong.

### Buttons and ARIA, which is a departure

The toolbar is deliberately built from `div` and `span`, and that was left
alone. This dialog is not: it has real `<button>` elements, `role="dialog"`,
`aria-modal="true"` and `aria-labelledby`, on the owner's instruction.

The reason it matters more here than on a toolbar is that a modal makes a claim
about the rest of the page — that it is unreachable. Keyboard and assistive
technology have to be told, or the claim is only true for the mouse. So:

- **Focus moves in** on open — the field if there is one, otherwise the answer
  button — and **goes back where it came from** on close.
- **Tab wraps** inside the dialog instead of walking out behind it.
- **`inert`** on every other child of `<body>` takes the page out of the tab
  order and out of reach of the mouse in one go. Anything already inert for its
  own reasons is left alone, so it does not come back switched on.
- **Enter accepts, Escape cancels**, which is what the native ones did for free
  and would have been a real regression to lose.

### Escape is never yes

`askYesNo` resolves `false` on Escape and on a backdrop click, and `askText`
resolves `null` rather than `''`.

Both are load-bearing. Every caller tests `=== null` to mean cancelled, so an
empty string would rename a project to nothing. And the yes/no questions are
`Delete "x"?` and `Restore all three files?` — if dismissing one could ever mean
yes, the dialog would be worse than no dialog at all. Two of the ten mutations
are exactly these, and both are caught.

### Queued, not stacked

Dialogs chain rather than overwrite: a save that fails while a confirm is open
waits its turn instead of either one being lost. Without it the second call
would redraw the one box that exists and the first caller would wait forever.

### The test seam, and why the real thing is still driven

Dozens of existing checks only need an answer, not a dialog. Those replace
`askText` and `askYesNo` the same way the AI checks replace `askModel` — which
is why all three are declared `let`, with a comment saying so.

A seam that is never bypassed proves nothing, so `dialogChecks` drives the real
dialog: opening it, typing into it, pressing Escape and Enter and Tab at it,
clicking its backdrop, and reading focus and `inert` back out. It runs **first**
in the core chain, so no other block's stub can have leaked into it.

The last of those checks fetches `index.js`, `problems.js` and `store.js` and
scans them for `alert(`, `confirm(` and `prompt(`. One left behind would block
the page and look like another application, and nothing else here would notice.

### A box, where a line was the wrong shape

`askLongText` came later, and from a complaint about the AI problem prompt: one
line, sized for `"binary trees, medium"`, when the thing people actually want to
do is **paste a whole problem statement** and have it set up as a stub with
tests. That never fitted.

It is the same dialog with a `<textarea>` instead of an `<input>`, and it is the
only one of the four with a behaviour of its own: **Enter types a newline, so
ctrl+Enter is what sends.** Escape still cancels, and cancelling is still `null`.

Two things follow from that, and both are checked:

- **The dialog says so.** A hint sits beside the buttons, shown only for this
  kind. A keyboard contract that changes without telling you is worse than one
  that never existed.
- **The textarea had to join the focus trap**, which was written before it
  existed. This is where a mutation earned its keep. The first version of the
  check pressed Tab once from the box and asserted focus was still inside the
  dialog - and it **passed with the textarea removed from the trap**, because
  the cycle falls back to the first control when it does not recognise where you
  are. One step cannot tell the two apart. What actually breaks is coming
  *back*: you would be stuck going cancel, ok, cancel, with no way into the box
  again. The check now walks the whole cycle and asserts it returns to the
  textarea.

The three one-line questions - name a snapshot, name a project, rename a project
- stayed one-line on purpose. They are names, not prose.

### Saying that something is happening

The fifth kind came from using the thing. You type a topic, press ctrl+Enter,
the dialog closes — and then the editor sits there, apparently idle, for several
seconds, before the project changes underneath you.

There *was* a progress message. `beginAiRow('writing a problem...')` wrote one
into the console the whole time. But the console lives inside the preview pane,
and if you are looking at the editor it is not on screen. A message nobody sees
is not a message — the same lesson [17](17-ai-practice-problems.md) had already
learned about failures, re-learned about the happy path.

`showBusy(message)` is the dialog with nothing to answer: a heading, a line of
detail, a spinner, and no buttons at all. It returns the function that takes it
down, which is safe to call twice — the caller should not have to know whether
Escape got there first.

Three decisions, all of them checked:

- **Enter and clicking away do nothing.** They are the two ways people dismiss a
  dialog by reflex, and here they would take away the only thing on screen
  saying the request is still running.
- **Escape still works**, so a request that never comes back is not a trap.
  Taking the dialog down does not cancel anything; whatever was asked for still
  arrives.
- **It focuses itself** (`tabindex="-1"` on the dialog) and sets
  `aria-busy="true"`, because there is no control inside to put the keyboard on,
  and `inert` has just taken away whatever had it. The attribute comes back off
  on close — a mutation that left it on was caught by the check that the
  dialog can be taken down, which is where it would show up in practice too.

### Verification

`node test/run.js` — **258 checks**, all passing. Twenty-seven are new: nothing on
screen until something asks, the ARIA that makes it a dialog, a question split
into heading and detail, the suggested answer selected and ready to replace,
Enter answering with what was typed, Escape giving null rather than empty, the
cancel button meaning the same as Escape, a yes/no having no field, yes being
true, no being false, Escape on a yes/no never being yes, a message with no
cancel at all, acknowledging closing it, focus going in and coming back,
the page behind unreachable while open and reachable after, Tab going round
instead of out, the backdrop cancelling while the box does not, two questions
queueing, a message written as text so a filename cannot run code, and no native
dialog left anywhere in the app. Seven more cover the textarea: a long question
opening a box rather than a line, the hint that says how to send, Enter typing a
newline instead of answering, ctrl+Enter answering with every line intact, Tab
going round the box and the buttons and back into the box, Escape still giving
null, and a short question afterwards being a line again with no hint and no box
left behind. Six more cover the waiting dialog: what it shows and what it
hides, that it is announced as working rather than as a question with no answer,
that Enter and a click on the backdrop leave it alone, that whoever put it up can
take it down, that taking it down twice is not an error, and that Escape is a way
out of a wait that never ends. Two more drive the real path: the dialog is on
screen *while* the model is working — which a stub that resolves immediately can
never show, so that check holds the reply open until it has looked — and gone
once the problem has been set.

Mutation-checked, sixteen of them, **all caught**: Escape on a destructive
question meaning yes, cancelling a rename giving `''`, the page behind left
reachable, focus not given back, the heading built with `innerHTML`, Tab allowed
to walk out, the queue removed, any click counting as clicking away, a cancel
button on a message that has nothing to cancel, and the suggested name left
unselected - then, for the textarea, Enter submitting so a second line cannot be
typed, the textarea left out of the focus trap, the hint never shown, the hint
left behind on the next question, the textarea left behind on the next question,
and a long question answered from the one-line field instead; then, for the
wait, the dialog never going up, being left marked busy after it closed, Enter
dismissing it, clicking away dismissing it, and Escape not being a way out.

One of them survived its first run and is written up above; the check it exposed
was the weak one, not the code.

## The save panel, while we were here

The same change fixed the panel that reports the inconsistency best. Its three
rows — the filename field, **export project**, **copy share link** — agreed on
almost nothing:

| | width | font-size | gap above | radius |
|---|---|---|---|---|
| field + button | 80% of its own row | 20px | — | 8px |
| `#export` | 80% of the box | 20px | 25px | 5px |
| `#share` | 80% of the box | **16px** | **12px** | 5px |

The width was the interesting one. `width: 80%` sat on the *field*, whose
container was sized by the field — a percentage of something that was a
percentage of itself. The row now carries the width and the field is `flex: 1`
inside it, so the pill matches the two rows below it instead of resolving to
whatever the browser decided.

Heights needed stating in pixels rather than as a ratio: Chrome gives an
`<input>` a taller line box than a `div` at the same `line-height`, which is
worth 1.8px and is visible. All three are 40px, 16px type, 24px line, 12px
apart, with the gap owned by the container so the rows cannot disagree again.

## Not done

- **Theming the dialog.** It matches the save panel, which is light whatever the
  editor theme is. Both should probably follow the theme one day; neither does
  today, and doing one without the other would be worse.
- **A dialog that asks more than one thing.** Nothing needs it yet.
- **An AI pane with a conversation in it**, which is the larger version of the
  complaint the textarea answers: there is still no way to say "make it harder"
  or "use a linked list instead". Deliberately not started. The hard parts are
  not the UI - the Groq key is shared between everyone using the site, a chat
  invites ten requests where there was one, and rendering model output as
  markdown would reopen the injection surface that `textContent` closes.

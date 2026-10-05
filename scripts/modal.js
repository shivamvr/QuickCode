//=====================================================================
// A dialog of QuickCode's own.
//
// prompt(), confirm() and alert() are gone from here. They cannot be styled,
// they look like a different application sitting on top of this one, they
// block the whole page - including the preview iframe and any save in flight -
// and browsers are free to suppress them, which turns a question nobody was
// asked into a silent cancel.
//
// Three calls replace all sixteen of them. Every one is async, because a
// dialog cannot return a value in the same turn the way the native ones could:
//
//   await askText(message, value)       -> the string, or null if cancelled
//   await askLongText(message, value)   -> the same, in a box worth pasting into
//   await askYesNo(message)             -> true or false
//   sayProblem(message)                 -> resolves once it has been dismissed
//   showBusy(message)                   -> returns the function that takes it down
//
// A message may carry a second paragraph after a blank line. That is how the
// native ones were already written, so every piece of wording moved across
// untouched - the first paragraph becomes the heading, the rest the detail.
//=====================================================================

// Only one dialog at a time, and calls queue rather than replace each other: a
// save that fails while a confirm is open must not throw either away.
let dialogQueue = Promise.resolve()

// what the keyboard goes back to when the dialog closes
let dialogReturnFocus = null

// how to take down the dialog that is waiting for something, if one is up
let dialogBusyClose = null

// everything outside the dialog, made unreachable while it is open
let dialogInerted = []

const DIALOG_BREAK = '\n\n'

// The heading is the first paragraph, the detail is whatever follows. Splitting
// here rather than at sixteen call sites is what let the messages stay as they
// were written.
const splitMessage = (message) => {
  const text = String(message === null || message === undefined ? '' : message)
  const at = text.indexOf(DIALOG_BREAK)
  if (at < 0) return { head: text, detail: '' }
  return { head: text.slice(0, at), detail: text.slice(at + DIALOG_BREAK.length) }
}

const dialogParts = () => ({
  root: document.querySelector('#dialog'),
  head: document.querySelector('#dialogTitle'),
  detail: document.querySelector('#dialogDetail'),
  input: document.querySelector('#dialogInput'),
  text: document.querySelector('#dialogText'),
  hint: document.querySelector('#dialogHint'),
  spinner: document.querySelector('#dialogSpinner'),
  cancel: document.querySelector('#dialogCancel'),
  ok: document.querySelector('#dialogOk'),
})

// Hidden controls are not focusable, so the trap has to ask what is on screen
// rather than assume all three are.
const dialogFocusable = () => {
  const p = dialogParts()
  return [p.input, p.text, p.cancel, p.ok].filter((el) => el && !el.hidden)
}

// inert takes the rest of the page out of the tab order AND out of reach of the
// mouse, which is the whole of "modal". Anything already inert for its own
// reasons is left alone, so it does not come back switched on.
const makeRestInert = (root) => {
  dialogInerted = []
  Array.prototype.forEach.call(document.body.children, (el) => {
    if (el === root || el.tagName === 'SCRIPT' || el.inert) return
    el.inert = true
    dialogInerted.push(el)
  })
}

const undoInert = () => {
  dialogInerted.forEach((el) => { el.inert = false })
  dialogInerted = []
}

// kind is 'text', 'long', 'yesno', 'tell' or 'busy'. They differ only in which
// controls are on show and what the answer looks like. 'busy' is the odd one:
// nothing to answer, and it is taken down by whoever put it up.
function showDialog(kind, message, value) {
  return new Promise((resolve) => {
    const p = dialogParts()
    // No dialog in the document is not a reason to lose the answer. Cancel is
    // the safe reading of every one of these questions.
    if (!p.root || !p.head || !p.ok) {
      resolve(kind === 'yesno' ? false : (kind === 'text' ? null : undefined))
      return
    }

    const parts = splitMessage(message)
    p.head.textContent = parts.head
    p.detail.textContent = parts.detail
    p.detail.hidden = !parts.detail

    // the one control this kind of question is answered in, if any
    const field = kind === 'text' ? p.input : (kind === 'long' ? p.text : null)
    p.input.hidden = kind !== 'text'
    p.text.hidden = kind !== 'long'
    if (field) field.value = value !== null && value !== undefined ? String(value) : ''

    // Enter is a newline in a textarea, so it cannot also mean "done" there.
    // That is worth saying out loud rather than leaving to be discovered.
    p.hint.hidden = kind !== 'long'

    // nothing to cancel when the dialog is only telling you something, and
    // nothing to press at all while it is waiting
    p.cancel.hidden = kind === 'tell' || kind === 'busy'
    p.ok.hidden = kind === 'busy'
    p.ok.textContent = kind === 'yesno' ? 'Yes' : 'OK'

    p.spinner.hidden = kind !== 'busy'
    // so it is announced as working rather than as a question with no answer
    p.root.setAttribute('aria-busy', kind === 'busy' ? 'true' : 'false')

    dialogReturnFocus = document.activeElement

    const finish = (answer) => {
      document.removeEventListener('keydown', onKey, true)
      p.ok.removeEventListener('click', onOk)
      p.cancel.removeEventListener('click', onCancel)
      p.root.removeEventListener('mousedown', onBackdrop)
      p.root.classList.remove('showing')
      // it was set on the way in, so it has to come off on the way out - a
      // dialog left marked busy is a dialog screen readers keep apologising for
      p.root.setAttribute('aria-busy', 'false')
      undoInert()
      // put the keyboard back where it was, or the page is left with focus on
      // nothing and the next Tab starts from the top
      if (dialogReturnFocus && typeof dialogReturnFocus.focus === 'function') {
        try { dialogReturnFocus.focus() } catch (err) { /* gone from the document */ }
      }
      dialogReturnFocus = null
      dialogBusyClose = null
      resolve(answer)
    }

    // Escape is the only way out of a waiting dialog, so there is one even if
    // the request never comes back. Taking it down does not cancel the request;
    // whatever was asked for still arrives.
    if (kind === 'busy') dialogBusyClose = () => finish(undefined)

    const accept = () => finish(
      field ? field.value : (kind === 'yesno' ? true : undefined))
    const dismiss = () => finish(
      field ? null : (kind === 'yesno' ? false : undefined))

    const onOk = () => accept()
    const onCancel = () => dismiss()
    // only the backdrop itself, so a drag that ends outside the box does not
    // count as clicking away
    // ...and not at all while waiting, or a stray click loses the only thing
    // on screen that says the request is still going
    const onBackdrop = (e) => { if (kind !== 'busy' && e.target === p.root) dismiss() }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        dismiss()
        return
      }
      // a waiting dialog has nothing to accept, so Enter does nothing to it
      if (e.key === 'Enter' && kind === 'busy') return
      if (e.key === 'Enter') {
        // In the textarea only ctrl/cmd+Enter is "done", or there would be no
        // way to type a second line. Anywhere else Enter accepts - except on
        // Cancel, where falling through lets the button do its own job.
        const typing = document.activeElement === p.text
        const means = typing ? (e.ctrlKey || e.metaKey) : document.activeElement !== p.cancel
        if (!means) return
        e.preventDefault()
        e.stopPropagation()
        accept()
        return
      }
      if (e.key !== 'Tab') return
      // the trap: Tab off either end comes back round instead of walking into
      // the page behind, which inert has made unreachable anyway
      const order = dialogFocusable()
      if (!order.length) return
      e.preventDefault()
      const at = order.indexOf(document.activeElement)
      const step = e.shiftKey ? -1 : 1
      const next = (at < 0 ? 0 : at + step + order.length) % order.length
      order[next].focus()
    }

    p.ok.addEventListener('click', onOk)
    p.cancel.addEventListener('click', onCancel)
    p.root.addEventListener('mousedown', onBackdrop)
    document.addEventListener('keydown', onKey, true)

    p.root.classList.add('showing')
    makeRestInert(p.root)

    // the field if there is one to fill in, otherwise the answer button - and
    // when there is neither, the dialog itself, so focus is not left on an
    // element that inert has just taken away
    if (field) {
      field.focus()
      field.select()
    } else if (kind === 'busy') {
      p.root.focus()
    } else {
      p.ok.focus()
    }
  })
}

// Chained, so two dialogs never share the screen. A rejection in one must not
// stall the queue for the next.
const queueDialog = (run) => {
  const next = dialogQueue.then(run, run)
  dialogQueue = next.catch(() => {})
  return next
}

// let, not const, and this is the reason: the suite replaces these three the
// way it replaces askModel, so the dozens of checks that only need an answer
// do not each have to drive a dialog. The dialog itself is driven for real by
// the checks in dialogChecks, which is where it belongs.
let askText = (message, value) => queueDialog(() => showDialog('text', message, value))
let askLongText = (message, value) => queueDialog(() => showDialog('long', message, value))
let askYesNo = (message) => queueDialog(() => showDialog('yesno', message))
let sayProblem = (message) => queueDialog(() => showDialog('tell', message))

// Returns the function that takes it down, which is safe to call twice - the
// caller should not have to know whether Escape got there first.
let showBusy = (message) => {
  const done = queueDialog(() => showDialog('busy', message))
  return () => {
    if (dialogBusyClose) dialogBusyClose()
    return done
  }
}

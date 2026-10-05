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
//   await askText(message, value)   -> the string, or null if cancelled
//   await askYesNo(message)         -> true or false
//   sayProblem(message)             -> resolves once it has been dismissed
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
  cancel: document.querySelector('#dialogCancel'),
  ok: document.querySelector('#dialogOk'),
})

// Hidden controls are not focusable, so the trap has to ask what is on screen
// rather than assume all three are.
const dialogFocusable = () => {
  const p = dialogParts()
  return [p.input, p.cancel, p.ok].filter((el) => el && !el.hidden)
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

// kind is 'text', 'yesno' or 'tell'. The three differ only in which controls
// are on show and what the answer looks like.
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

    p.input.hidden = kind !== 'text'
    p.input.value = kind === 'text' && value !== null && value !== undefined ? String(value) : ''

    // nothing to cancel when the dialog is only telling you something
    p.cancel.hidden = kind === 'tell'
    p.ok.textContent = kind === 'yesno' ? 'Yes' : 'OK'

    dialogReturnFocus = document.activeElement

    const finish = (answer) => {
      document.removeEventListener('keydown', onKey, true)
      p.ok.removeEventListener('click', onOk)
      p.cancel.removeEventListener('click', onCancel)
      p.root.removeEventListener('mousedown', onBackdrop)
      p.root.classList.remove('showing')
      undoInert()
      // put the keyboard back where it was, or the page is left with focus on
      // nothing and the next Tab starts from the top
      if (dialogReturnFocus && typeof dialogReturnFocus.focus === 'function') {
        try { dialogReturnFocus.focus() } catch (err) { /* gone from the document */ }
      }
      dialogReturnFocus = null
      resolve(answer)
    }

    const accept = () => finish(
      kind === 'text' ? p.input.value : (kind === 'yesno' ? true : undefined))
    const dismiss = () => finish(
      kind === 'text' ? null : (kind === 'yesno' ? false : undefined))

    const onOk = () => accept()
    const onCancel = () => dismiss()
    // only the backdrop itself, so a drag that ends outside the box does not
    // count as clicking away
    const onBackdrop = (e) => { if (e.target === p.root) dismiss() }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        dismiss()
        return
      }
      if (e.key === 'Enter' && document.activeElement !== p.cancel) {
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

    // the field if there is one to fill in, otherwise the answer button
    if (kind === 'text') {
      p.input.focus()
      p.input.select()
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
let askYesNo = (message) => queueDialog(() => showDialog('yesno', message))
let sayProblem = (message) => queueDialog(() => showDialog('tell', message))

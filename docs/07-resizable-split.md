# 07 — Resizable split

**Size:** S · **Depends on:** nothing · **Status:** done (see Outcome)

## Why

The split is hard-coded at 50/50. `doSplit()` sets every pane to `width: 50%`
and `singleEditor()` sets them back to `100%`
([scripts/eventListener.js:20-38](../scripts/eventListener.js#L20-L38)). Any
real use wants an uneven split — wide HTML next to a narrow CSS pane, or the
reverse while styling.

## Approach

Add a drag handle between the panes and drive the widths from a stored ratio.

```js
const setSplitRatio = (ratio) => {
  const r = Math.min(0.85, Math.max(0.15, ratio))   // never let a pane vanish
  document.documentElement.style.setProperty('--split-ratio', r)
  saveSettings({ splitRatio: r })
}
```

Then let CSS do the work, replacing the inline `style.width` writes:

```css
#editor > .editor      { width: calc(var(--split-ratio, .5) * 100%); }
#editor > #splitContainer { width: calc((1 - var(--split-ratio, .5)) * 100%); }
```

Use **pointer events**, not mouse events, so it works with a trackpad, a pen and
touch:

```js
handle.addEventListener('pointerdown', (e) => {
  handle.setPointerCapture(e.pointerId)   // keeps events coming outside the handle
  const move = (ev) => setSplitRatio(ev.clientX / gets('#editor').clientWidth)
  const up = () => {
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', up)
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', up)
})
```

Three details that matter here:

- Add `splitRatio: 0.5` to `defaultSettings`
  ([scripts/index.js:12](../scripts/index.js#L12)) so it persists and existing
  installs get a sane value via the defaults merge.
- The editors are created with `automaticLayout: true`, so monaco re-layouts
  itself on resize. Do not call `layout()` manually in the drag loop.
- The vertical-nav stylesheet and the `max-width: 650px` media query in
  `tabs.css` switch the split to a **stacked** layout (`flex-direction: column`
  with `height` overrides). The ratio must apply to `height` in that mode, or
  drop the handle entirely on narrow screens. Check both before calling it done.

## Verification

- Drag left and right; both panes resize smoothly and neither can be dragged to
  zero width.
- The ratio survives a reload.
- Works via touch/pen emulation, not just a mouse.
- At a viewport under 650px the stacked layout is not broken by the ratio.
- Collapsing to a single editor and re-splitting restores the stored ratio.

## Risks

Low. The main trap is fighting the existing inline `style.width` writes in
`doSplit()` / `singleEditor()` — move those to the CSS variable rather than
leaving both mechanisms in play.

## Done when

The divider drags, the ratio persists across reloads, and the narrow-screen
stacked layout is unaffected.

## Outcome

Done. A 6px drag handle sits between the panes; `splitRatio` persists in
settings (clamped to 0.15-0.85 so neither pane can be dragged away).

Widths stayed **inline** rather than moving to a CSS class, because the
`max-width: 650px` rules in `tabs.css` stack the panes with
`width: 100% !important`, and that has to keep winning. The handle is hidden
there too.

The ratio is written once on pointer-up, not on every pointer move - persisting
mid-drag would have undone the point of the batched-storage work.

Covered by `node test/run.js`: drag to 0.75 and 0.25, clamping past both ends,
the pane taking the complement, and the handle hiding when the split closes.

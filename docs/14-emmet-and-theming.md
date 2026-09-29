# 14 — Emmet and theme polish

**Size:** S · **Depends on:** nothing · **Status:** not started

Two small visible inconsistencies, unrelated except that both are quick.

## Emmet only works in HTML

`initCore()` calls `emmetMonaco.emmetHTML(monaco)`
([scripts/index.js:426](../scripts/index.js#L426)) and nothing else. The library
also exports `emmetCSS` and `emmetJSX`, so the CSS pane is missing abbreviations
like `m10` → `margin: 10px` and `df` → `display: flex`.

```js
emmetMonaco.emmetHTML(monaco)
emmetMonaco.emmetCSS(monaco)     // also applies to scss/less if added later
emmetMonaco.emmetJSX(monaco)     // only useful once item 10 lands
```

Each returns a dispose function. They attach per-language, so registering CSS is
safe and independent.

Check for a Tab-key conflict: emmet binds Tab for expansion, and monaco uses Tab
for indent and snippet navigation. It behaves in the HTML pane today, so the CSS
pane should be fine, but verify rather than assume — especially inside an
indented block.

## The toolbar ignores the editor theme

`settheme()` only calls `monaco.editor.setTheme`
([scripts/index.js:297](../scripts/index.js#L297)). The nav, tabs and dropdowns
are styled by fixed colours in `styles/`, so selecting Dracula gives a dark
editor under a light toolbar. Now that `vs-dark` is the default, the mismatch is
the first thing a new user sees.

**Approach.** Convert the chrome colours to custom properties, then set them from
the theme's own data — which is already fetched and parsed:

```js
.then((data) => {
  monaco.editor.defineTheme(themeName, data)
  monaco.editor.setTheme(themeName)
  applyChromeColors(data)     // data.colors has editor.background, editor.foreground, ...
})
```

Theme JSON files carry a `colors` object with keys like `editor.background`,
`editor.foreground`, `editorWidget.background` — enough to derive a toolbar
background, text colour and border. Map a handful onto CSS variables on `:root`.

Two cases to handle deliberately:

- **`vs` and `vs-dark` return early** before any fetch
  ([scripts/index.js:301](../scripts/index.js#L301)), so they have no `data`.
  Hardcode a light and a dark palette for those two.
- **The fallback path.** The `.catch` sets `vs-dark`; the chrome must follow, or a
  failed theme load leaves a mismatched toolbar.

Worth considering at the same time: respect `prefers-color-scheme` for the
*first* run only, so a new user on a light system does not get a dark editor
unrequested. Leave an explicit choice alone once made.

## Verification

- `m10` expands in the CSS pane; `div.a>ul>li*3` still expands in HTML.
- Tab still indents normally in both panes, including inside a nested block.
- Switching through several themes updates the toolbar each time.
- `vs`, `vs-dark`, and a deliberately broken theme name all leave the toolbar
  consistent with the editor.
- Reloading keeps the chrome matching the restored theme.

## Risks

Low. The theming half touches `styles/` broadly, and `verticalNav.css` is a
toggleable override sheet whose rules must keep winning — if hardcoded colours
are replaced with variables there, check the vertical layout still looks right.

## Done when

Emmet works in the CSS pane and the toolbar visibly follows the selected theme,
including for `vs`, `vs-dark` and the failure fallback.

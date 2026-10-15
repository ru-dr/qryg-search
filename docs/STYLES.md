# Custom styles

A style is a CSS file that QryG applies on top of its built-in look. You can restyle anything: colours, borders, corner radius, spacing and fonts.

## Quick start

```bash
qryg-search style new mine        # creates ~/.config/qryg-search/styles/mine.css from an example
qryg-search style use mine        # apply it
```

Open `~/.config/qryg-search/styles/mine.css` in any editor. Every save applies straight away, so keep QryG open while you edit.

```bash
qryg-search style                 # list styles, and see which one is active
qryg-search style off             # back to the built-in look
qryg-search style rm mine
qryg-search style new other ~/Downloads/other.css   # start from someone else's file
```

You can also pick a style in **Preferences → Appearance → Style**, which has a button to open the styles folder.

## How it works

- Write plain selectors such as `.qryg-search-bar` or `.list-search-result:selected`. QryG scopes them to its own window, so they never affect the rest of GNOME Shell.
- Your rules override the built-in look, including the accent, radius and opacity settings. You don't need `!important`.
- Start a selector with `.theme-light` for rules that apply only in light mode.
- Use `.qryg-search-container` to target the outer window itself.
- GNOME Shell CSS is a subset of web CSS. Colours, `border`, `border-radius`, `padding`, `margin`, `spacing`, `font-*`, `box-shadow` and `background-gradient-*` work. Variables, `@media`, `display` and grid don't.

## Selectors

| Selector | Element |
|---|---|
| `.qryg-search-container` | The outer window |
| `.qryg-search-bar` | The search bar |
| `.qryg-search-bar StEntry` | The text field in the bar |
| `.qryg-search-ghost` | The inline completion text |
| `.qryg-search-bar-result-icon` | The icon at the left of the bar |
| `.qryg-search-filters`, `.qryg-search-filter-button`, `.qryg-search-filter-icon` | The filter buttons |
| `.qryg-search-filter-button:checked` | The active filter |
| `.qryg-search-results` | The results card |
| `.qryg-search-section` | One section of results |
| `.qryg-search-section-header` | Section titles such as "Top Hit" |
| `.list-search-result` | A result row |
| `.list-search-result:selected` | The selected row |
| `.list-search-result-title`, `.list-search-result-description` | Row title and subtitle |
| `.qryg-search-top-hit` | The Top Hit row |
| `.qryg-search-row-actions`, `.qryg-search-row-action`, `.qryg-search-row-action-icon` | The buttons on the selected row |
| `.qryg-search-preview` | The preview pane |
| `.qryg-search-preview-title`, `.qryg-search-preview-kind`, `.qryg-search-preview-body`, `.qryg-search-preview-code` | Preview text |
| `.qryg-search-preview-row`, `.qryg-search-preview-key`, `.qryg-search-preview-value` | Preview details |
| `.qryg-search-preview-separator` | The line in the preview |
| `.qryg-search-preview-thumb` | Image thumbnails |
| `.qryg-search-spectrum`, `.qryg-search-spectrum-swatch`, `.qryg-search-spectrum-base`, `.qryg-search-spectrum-hex` | The colour spectrum |

## Example

```css
.qryg-search-bar,
.qryg-search-results {
  background-color: rgba(28, 28, 30, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}

.list-search-result:selected {
  background-color: rgba(255, 255, 255, 0.12);
}

.theme-light .qryg-search-bar,
.theme-light .qryg-search-results {
  background-color: rgba(250, 250, 250, 0.98);
}
```

There are more examples in [`examples/styles`](../examples/styles).

## Sharing

A style is a single file. Share it as a gist or put it in a repository. Others can install it with:

```bash
qryg-search style new NAME path/to/file.css
```

If something looks wrong, `qryg-search doctor` tells you when the active style file is missing.

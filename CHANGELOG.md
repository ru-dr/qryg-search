# Changelog

All notable changes to QryG Search are listed here. The format follows [Keep a Changelog](https://keepachangelog.com), and versions follow [Semantic Versioning](https://semver.org).

## Unreleased

### Added

- `Ctrl + Tab` / `Ctrl + Shift + Tab` cycle the filters, a color picker and a Reset appearance button in Preferences, and screen reader names for the preview and inline completion
- **Session plugin:** lock, suspend, hibernate (when available), log out, restart and power off from the search bar. Log out, restart and power off show GNOME's confirmation dialog.
- **Emoji plugin:** a bundled emoji picker with every emoji from the Unicode CLDR data, on `:`. Searches names and keywords, with a skin tone setting and buttons to copy the name or code points.
- **Processes plugin:** `kill firefox` lists your own processes with their memory use. `Enter` sends SIGTERM, and *Force kill* sends SIGKILL. Session processes are never listed.
- **Time plugin:** world clocks, like `time tokyo`, `time in new york`, `now utc` and `utc+5:30`, with a *World clocks* setting for zones to show with `time`. Unix timestamps also show how long ago they were.

### Changed

- `Esc` clears the filter, then the text, then closes. Rows, headers and the preview scale with the font size, the preview fades in, and an empty filter explains how to search everything
- New name: QryG Search. The extension UUID is now `qryg-search@ru-dr`, the settings schema is `io.github.ru_dr.QrygSearch`, the CLI is `qryg-search`, CSS classes use the `.qryg-search-` prefix, and plugin environment variables use `QRYG_SEARCH_`. User files moved to `qryg-search` folders under `~/.config`, `~/.local/share` and `~/.cache`. Old settings and files are not migrated.

### Fixed

- Row action buttons in the light theme, the preview title colour, and the window height on short screens

## 1.0.0 - 2026-10-08

The first public release.

### Launcher

- A floating search bar on `Super + Space`
- Custom CSS styles in `~/.config/qryg-search/styles`, applied live as you edit them
- Top Hit, inline completion, a preview pane, and a bar icon that follows the selection
- Filters for Apps, Files, Actions and Clipboard
- Row actions: new window, show in folder, copy, bookmark
- Opens over fullscreen apps
- `Super + Space` never reaches the app behind it, and `Super` closes QryG
- Focuses the launched app correctly when started from the Overview

### Plugins

- **Plugin system, API v1:** JavaScript plugins and script plugins in any language
  - manifests, settings, previews, actions and effects
  - user prefixes
  - live reload
  - long-running script plugins that keep one process alive
  - result scores, so a strong match from any plugin can become the Top Hit
  - a plugin API version check, and `qryg-search plugin update`
- **Bundled plugins:** calculator, units, currency, colours, generators, time, shell with a safe live preview, web, bookmarks, files (plocate), windows and clipboard (Copyous)
- The calculator works without a prefix
- Prefixes can be changed per plugin

### Tools

- `qryg-search` CLI for settings, features, sources, prefixes, plugins, styles and bookmarks
- `qryg-search doctor`
- Preferences window with Plugins and Bookmarks pages

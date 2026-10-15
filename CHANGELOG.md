# Changelog

All notable changes to QryG Search are listed here. The format follows [Keep a Changelog](https://keepachangelog.com), and versions follow [Semantic Versioning](https://semver.org).

## Unreleased

### Added

- `Ctrl + Tab` / `Ctrl + Shift + Tab` cycle the filters, a color picker and a Reset appearance button in Preferences, and screen reader names for the preview and inline completion
- **Session plugin:** lock, suspend, hibernate (when available), log out, restart and power off from the search bar. Log out, restart and power off show GNOME's confirmation dialog.
- **Emoji plugin:** a bundled emoji picker with every emoji from the Unicode CLDR data, on `:`. Searches names and keywords, with a skin tone setting and buttons to copy the name or code points.
- **Processes plugin:** `kill firefox` lists your own processes with their memory use. `Enter` sends SIGTERM, and *Force kill* sends SIGKILL. Session processes are never listed.
- **Time plugin:** world clocks, like `time tokyo`, `time in new york`, `now utc` and `utc+5:30`, with a *World clocks* setting for zones to show with `time`. Unix timestamps also show how long ago they were.
- `qryg-search plugin validate ID|PATH` checks a manifest and warns about unknown fields and values that fall back to a default
- `qryg-search plugin test ID QUERY [--activate N]` runs one query outside GNOME Shell and prints the results, timing, and what `Enter` would do
- `qryg-search plugin reload ID` reloads a single plugin
- Preferences → Plugins shows plugins that failed to load under *Not loaded*, and a warning with the last error on plugins that fail or time out while running
- Plugin API: optional `enable()` and `disable()` methods, called when the plugin is turned on or off
- Plugin API: `api.timeout`, `api.idle` and `api.connect`, removed automatically when the plugin is destroyed
- Plugin API: `api.fetchJson` with a shared HTTP session and an optional disk cache, and `api.match` for fuzzy match scores
- Persistent script plugins: a `startupTimeout` manifest field, a `{"method": "ready"}` message, and `{"method": "error"}` messages shown in preferences

### Changed

- `Esc` clears the filter, then the text, then closes. Rows, headers and the preview scale with the font size, the preview fades in, and an empty filter explains how to search everything
- New name: QryG Search. The extension UUID is now `qryg-search@ru-dr`, the settings schema is `io.github.ru_dr.QrygSearch`, the CLI is `qryg-search`, CSS classes use the `.qryg-search-` prefix, and plugin environment variables use `QRYG_SEARCH_`. User files moved to `qryg-search` folders under `~/.config`, `~/.local/share` and `~/.cache`. Old settings and files are not migrated.
- The manifest `timeout` now also limits JavaScript plugin queries. A query that runs past it is cancelled.
- `api.settings.onChanged` fires only when one of the plugin's own values changes, and passes the changed keys
- Disabling a persistent script plugin stops its process
- The currency plugin uses `api.fetchJson`

### Fixed

- `Enter` copies a result's `copy` (or `path`) when the plugin's `activate` returns no effects, as documented; script plugins always skipped it
- The shell plugin's background command runs in the home folder, as its preview says, not in the plugin folder
- `int` plugin settings outside `min` and `max` fall back to the default, and `qryg-search plugin config` refuses them
- `qryg-search plugin config` refuses unknown words for `bool` settings instead of treating them as off
- `qryg-search bookmark rm` reports only the bookmarks it removed, and warns about names it didn't find
- The CLI reports file system errors and Ctrl+C cleanly, without a traceback
- A script plugin with an empty `command` list is checked for an executable `main`
- Script plugins get their cache and config folders created, like JavaScript plugins
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

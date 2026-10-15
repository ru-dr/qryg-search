# Changelog

All notable changes to QryG Search are listed here. The format follows [Keep a Changelog](https://keepachangelog.com), and versions follow [Semantic Versioning](https://semver.org).

## Unreleased

### Fixed

- When the preview was taller than the results, the last section stretched and its row drifted down, leaving a gap under its header

## 2.1.0 - 2026-10-15

### Changed

- Exact bookmark and file name matches rank higher, and open windows rank just below their app
- Clipboard times read "5 minutes ago"
- Currency results use the currency's own decimals, so yen has none, and `$50 to eur` or `€20` work
- `toggle` and `gsetting` in a plugin manifest only apply to bundled plugins
- Script plugins that exit with an error, or persistent ones that stop answering, now show the error in preferences, and a hung persistent plugin is restarted

### Fixed

- Installing a plugin from a folder or git repository refused links only in archives; links that lead outside the plugin folder are now refused for every source
- `100 cal to J` gave the kilocalorie answer, `utc+0` showed nothing, and `session lo` needed a third letter
- Generated passwords now use the system's secure random source
- Unit queries like `5 gal to cup` no longer wait for currency rates
- The launcher fades out with its results instead of an empty box
- `qryg install` and `qryg uninstall` no longer delete a checkout cloned straight into the extensions folder, and an empty shortcut no longer crashes `qryg`
- A user plugin with an invalid `toggle` no longer breaks Preferences → Plugins, which now refreshes after Reload

## 2.0.0 - 2026-10-15

### Added

- Every plugin has a prefix. New ones: `conv` for units, `fx` for currency, `col` for colours, `tz` for time and world clocks, `gen` for generators and `session` for session actions. They all still answer without the prefix.
- A usage guide for every plugin: typing a prefix on its own, or a query the plugin has nothing for, shows the plugin's examples first, which `Tab` completes and `Enter` fills in. Preferences → Plugins shows them under *How to use*, and `qryg plugin info` under *how to use*.
- `qryg plugin new` adds a starter `examples` list
- A one-line install: `curl -fsSL https://raw.githubusercontent.com/ru-dr/qryg-search/main/install.sh | bash`, which also updates when run again
- `qryg update` installs the newest release, or the newest commit when you follow a branch. `qryg update --check` only says whether there is one.
- Previews can show `examples`, as `["what to type", "what it does"]` pairs, each in its own block

### Changed

- **Breaking for plugin authors:** `keyword` and `examples` are now required in `manifest.json`. `examples` is a list of `["what to type", "what it does"]` pairs. A plugin without them is not loaded, shows under *Not loaded* in preferences, and can't be installed. `qryg plugin validate` names what is missing. See [Usage guide](docs/PLUGINS.md#usage-guide).
- The settings schema is now `org.gnome.shell.extensions.qryg-search`, as extensions.gnome.org requires. `qryg install` copies your 1.1 settings over once.
- The extension description says how QryG uses the clipboard and the network
- The extension zip no longer includes a compiled schema, which GNOME 44 and newer don't need

### Fixed

- Typing a space after a word prefix, like `gen `, now searches with the prefix right away. GNOME treats `gen` and `gen ` as the same search, so before, the prefix only applied after the next letter.

## 1.1.0 - 2026-10-14

### Added

- `Ctrl + Tab` / `Ctrl + Shift + Tab` cycle the filters, a color picker and a Reset appearance button in Preferences, and screen reader names for the preview and inline completion
- **Session plugin:** lock, suspend, hibernate (when available), log out, restart and power off from the search bar. Log out, restart and power off show GNOME's confirmation dialog.
- **Emoji plugin:** a bundled emoji picker with every emoji from the Unicode CLDR data, on `:`. Searches names and keywords, with a skin tone setting and buttons to copy the name or code points.
- **Processes plugin:** `kill firefox` lists your own processes with their memory use. `Enter` sends SIGTERM, and *Force kill* sends SIGKILL. Session processes are never listed.
- **Time plugin:** world clocks, like `time tokyo`, `time in new york`, `now utc` and `utc+5:30`, with a *World clocks* setting for zones to show with `time`. Unix timestamps also show how long ago they were.
- `qryg plugin validate ID|PATH` checks a manifest and warns about unknown fields and values that fall back to a default
- `qryg plugin test ID QUERY [--activate N]` runs one query outside GNOME Shell and prints the results, timing, and what `Enter` would do
- `qryg plugin reload ID` reloads a single plugin
- Preferences → Plugins shows plugins that failed to load under *Not loaded*, and a warning with the last error on plugins that fail or time out while running
- Plugin API: optional `enable()` and `disable()` methods, called when the plugin is turned on or off
- Plugin API: `api.timeout`, `api.idle` and `api.connect`, removed automatically when the plugin is destroyed
- Plugin API: `api.fetchJson` with a shared HTTP session and an optional disk cache, and `api.match` for fuzzy match scores
- Persistent script plugins: a `startupTimeout` manifest field, a `{"method": "ready"}` message, and `{"method": "error"}` messages shown in preferences
- `qryg plugin install` takes a repository folder URL (`…/tree/main/plugins/name`), a `.zip`, `.tar.gz`, `.tgz` or `.tar.xz` URL, or a `manifest.json` URL, besides a folder or git repository
- Preferences → Plugins → *Install a plugin*, with the same sources
- A summary of the plugin and its source, and a warning to review its code, before installing, with an `Install? [y/N]` question; `--yes` skips it
- An optional `files` manifest key: the files to fetch when installing from a `manifest.json` URL
- `qryg plugin update` works for every kind of source

### Changed

- `Esc` clears the filter, then the text, then closes. Rows, headers and the preview scale with the font size, the preview fades in, and an empty filter explains how to search everything
- New name: QryG Search. The extension UUID is now `qryg-search@ru-dr`, the settings schema is `io.github.ru_dr.QrygSearch`, the CLI is `qryg`, CSS classes use the `.qryg-search-` prefix, and plugin environment variables use `QRYG_SEARCH_`. User files moved to `qryg-search` folders under `~/.config`, `~/.local/share` and `~/.cache`. Old settings and files are not migrated.
- The manifest `timeout` now also limits JavaScript plugin queries. A query that runs past it is cancelled.
- `api.settings.onChanged` fires only when one of the plugin's own values changes, and passes the changed keys
- Disabling a persistent script plugin stops its process
- The currency plugin uses `api.fetchJson`

### Fixed

- Installing a plugin from its own installed folder no longer deletes it
- A failed install or update keeps the plugin that was there before
- `Enter` copies a result's `copy` (or `path`) when the plugin's `activate` returns no effects, as documented; script plugins always skipped it
- The shell plugin's background command runs in the home folder, as its preview says, not in the plugin folder
- `int` plugin settings outside `min` and `max` fall back to the default, and `qryg plugin config` refuses them
- `qryg plugin config` refuses unknown words for `bool` settings instead of treating them as off
- `qryg bookmark rm` reports only the bookmarks it removed, and warns about names it didn't find
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
  - a plugin API version check, and `qryg plugin update`
- **Bundled plugins:** calculator, units, currency, colours, generators, time, shell with a safe live preview, web, bookmarks, files (plocate), windows and clipboard (Copyous)
- The calculator works without a prefix
- Prefixes can be changed per plugin

### Tools

- `qryg` CLI for settings, features, sources, prefixes, plugins, styles and bookmarks
- `qryg doctor`
- Preferences window with Plugins and Bookmarks pages

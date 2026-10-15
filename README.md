<div align="center">

# QryG Search

Pronounced "query-gee".

A macOS-inspired, keyboard-first launcher for GNOME Shell, with a plugin system and custom styles.

`Super + Space`, type, `Enter`.

![GNOME Shell 48–51](https://img.shields.io/badge/GNOME_Shell-48--51-4a86cf?logo=gnome&logoColor=white)
![Wayland](https://img.shields.io/badge/Wayland-ready-success)
![Plugin API v1](https://img.shields.io/badge/plugin_API-v1-8a2be2)
![License GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue)
[![CI](https://github.com/ru-dr/qryg-search/actions/workflows/ci.yml/badge.svg)](https://github.com/ru-dr/qryg-search/actions/workflows/ci.yml)

![QryG Search](docs/screenshots/hero.png)

</div>

---

## Why

GNOME's Overview search is good, but it is tied to the Overview. QryG Search replaces it with a floating search bar that opens over any window, even fullscreen video, and adds the things you would otherwise need five different tools for: a calculator, unit and currency conversion, colour tools, a live shell, bookmarks, clipboard history and fast file search.

Every one of those features is a **plugin**. You can turn each one off, give it your own prefix, or write your own in JavaScript, Python, Bash or anything else that can read and write JSON.

## Highlights

<table>
<tr>
<td width="50%" valign="top"><img src="docs/screenshots/calculator.png" alt="Calculator"><br><b>Calculator and dev tools.</b> Just type <code>2^10 / 3</code>, <code>0xff to bin</code> or <code>sqrt 2</code>. No <code>=</code> needed.</td>
<td width="50%" valign="top"><img src="docs/screenshots/colors.png" alt="Colours"><br><b>Colours.</b> <code>#0a84ff</code>, <code>rgb()</code> or <code>hsl()</code>: every format, a five-step spectrum and WCAG contrast.</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="docs/screenshots/shell.png" alt="Shell"><br><b>Live shell.</b> <code>&gt; ls -la</code> shows the output as you type. Only safe, read-only commands run in the preview.</td>
<td width="50%" valign="top"><img src="docs/screenshots/currency.png" alt="Currency"><br><b>Currency and units.</b> <code>50 usd to inr</code>, <code>10 km to mi</code>, <code>1 GiB to MB</code>.</td>
</tr>
<tr>
<td width="50%" valign="top"><img src="docs/screenshots/bookmarks.png" alt="Bookmarks"><br><b>Bookmarks.</b> Files, folders, locations, commands and sites. <code>Ctrl + D</code> on any result adds one.</td>
<td width="50%" valign="top"><img src="docs/screenshots/plugin-emoji.png" alt="Emoji plugin"><br><b>Your own plugins.</b> This emoji picker is a 60-line Python script.</td>
</tr>
</table>

- **Top Hit**, inline completion, a preview pane, and a bar icon that follows the selection
- Filters for Apps, Files, Actions and Clipboard (`Super + 1` to `4`)
- Row actions: open in a new window, show in folder, copy, bookmark
- Fast file search with `plocate`, plus recent files and a live view of your home folders
- Opens over fullscreen apps, and `Super + Space` never leaks a key press into the app behind it
- Uses your system font and follows the light or dark theme, with your own accent colour
- A full CLI (`qryg`) and a preferences window, and every change applies live
- Custom styles: drop a CSS file in `~/.config/qryg-search/styles`, and it applies live as you edit it ([guide](docs/STYLES.md))


## Install

You need GNOME Shell 48 or newer. `plocate` (file search) and the Copyous extension (clipboard) are optional.

```bash
git clone https://github.com/ru-dr/qryg-search.git
cd qryg-search
./bin/qryg install       # installs the extension and links the qryg CLI into ~/.local/bin
```

Log out and back in, because Wayland only loads new extensions at login. Then run:

```bash
qryg enable
qryg doctor              # checks dependencies, shortcut and prefix conflicts
```

For development, `./bin/qryg install --link` symlinks the checkout instead.

## Using it

Type anything and every source is searched together. Calculator, units, currency, colours, time and generators answer on their own when the query looks like one of theirs. So do world clocks (`time tokyo`, `utc+2`) and session actions (`lock`, `restart`).

A **prefix** limits the search to one plugin. Symbol prefixes work right away (`>ls`), and word prefixes need a space (`f report`). Type a prefix on its own to see how to use that plugin. Every plugin's examples are also in **Preferences → Plugins** and `qryg plugin info ID`.

| Prefix | Plugin | Example |
|---|---|---|
| `=` | Calculator, only | `= 2pi` |
| `>` | Shell | `> git status` |
| `?` | Web | `? gnome shell`, `yt lofi` |
| `*` | Bookmarks | `* docs`, `*+ ~/Projects` adds one |
| `f` | Files | `f invoice` |
| `win` | Open windows | `win firefox` |
| `clip` | Clipboard | `clip password` |
| `:` | Emoji | `:fire`, `:thumbs up` |
| `kill` | Processes | `kill firefox` |
| `conv` | Units | `conv 10 km to mi` |
| `fx` | Currency | `fx 50 usd to inr` |
| `col` | Colours | `col 0a84ff` |
| `tz` | Time and world clocks | `tz tokyo` |
| `gen` | Generators | `gen uuid`, `gen password 32` |
| `session` | Session | `session` lists every action |

Prefixes are yours to change:

```bash
qryg keyword                 # list them
qryg keyword files /         # files now uses "/"
qryg keyword windows none    # no prefix
qryg keyword files default   # back to "f"
```

You can also change them in **Preferences → Plugins**.

### Keys

| Key | Action |
|---|---|
| `Super + Space` | Open or close |
| `Super` | Close |
| `Esc` | Clear the filter, then the text, then close |
| `↑` `↓` | Move through results |
| `Tab` or `→` | Accept the inline completion |
| `Enter` | Open or run |
| `Ctrl + Enter` | New window of the selected app |
| `Ctrl + Shift + E` or `Super + Enter` | Show in folder |
| `Ctrl + Shift + C` or `Super + C` | Copy the path or value |
| `Ctrl + D` | Bookmark the selection, or remove a bookmark |
| `Super + 1` to `4` | Apps, Files, Actions, Clipboard filter |
| `Ctrl + Tab`, `Ctrl + Shift + Tab` | Next or previous filter |
| `Backspace` on an empty bar | Clear the filter |

## What is a plugin, and what is GNOME

QryG does not use GNOME's search UI, but it does reuse GNOME's **search providers**: apps, Settings panels, and anything an app registers (Files, Calendar, Contacts and others). Everything else is a QryG plugin.

| Comes from GNOME | QryG plugins (bundled) |
|---|---|
| Apps, Settings, and app search providers | calc, units, currency, colors, generators, time, session, emoji, processes, shell, web, bookmarks, files, windows, clipboard |
| `qryg source` lists and toggles them | `qryg plugin` lists and toggles them |

```bash
qryg source off contacts calendar
qryg plugin disable currency
```

## Plugins

A plugin is a folder with a `manifest.json` and either a JavaScript module or any executable. Drop it in `~/.local/share/qryg-search/plugins/`. It can add results, previews, row buttons and its own settings, which appear in the preferences window automatically.

```bash
qryg plugin new weather                          # JavaScript
qryg plugin new todo --type script --lang python # or Python, or --lang bash
qryg plugin install https://github.com/you/qryg-search-plugin-x
qryg plugin install https://github.com/you/plugins/tree/main/weather   # or a .zip, or a manifest.json URL
qryg plugin reload
qryg plugin validate weather                     # check the manifest
qryg plugin test weather paris                   # run one query outside GNOME Shell
```

Preferences → Plugins → *Install a plugin* takes the same links. Both show what a plugin is and where it comes from before installing it.

> [!WARNING]
> Plugins run code on your computer. A JavaScript plugin runs inside GNOME Shell with full access to your session; a script plugin runs as your user. Only install plugins from sources you trust, and read the code first.

A complete JavaScript plugin:

```js
export default class Hello {
    constructor(api) {
        this.api = api;
    }

    query({query}) {
        const text = `Hello, ${query || 'world'}!`;
        return [{title: text, icon: 'face-smile-symbolic', copy: text}];
    }
}
```

A complete script plugin, in any language:

```python
#!/usr/bin/env python3
import json, sys

request = json.loads(sys.stdin.readline())
if sys.argv[1] == "query":
    q = request["query"]
    print(json.dumps({"results": [{"title": q.upper(), "copy": q.upper()}]}))
```

**📘 Read the [plugin guide](docs/PLUGINS.md)** for the manifest, the API, previews, actions and settings. Working examples are in [`examples/plugins`](examples/plugins).

## Styles

The look is plain CSS. A style is one file in `~/.config/qryg-search/styles/`. Your rules override the built-in look, and every save applies straight away.

```bash
qryg style new mine        # start from an example
qryg style use mine
```

```css
.qryg-search-bar, .qryg-search-results { border-radius: 0; border: 2px solid #ff375f; }
.list-search-result:selected { background-color: rgba(255, 255, 255, 0.12); }
```

**🎨 Read the [style guide](docs/STYLES.md)** for every selector. Examples are in [`examples/styles`](examples/styles).

## Configure

Everything applies live, with no logout.

```bash
qryg                          # status
qryg prefs                    # graphical preferences
qryg list                     # every setting
qryg style use mine           # a custom CSS style, see docs/STYLES.md
qryg theme dark               # default | dark | light
qryg accent '#ff375f'
qryg shortcut super+space
qryg set corner-radius 18
qryg set width 760
qryg set max-rows 7
qryg set search-engine 'https://duckduckgo.com/?q=%s'
qryg set currencies 'USD, EUR, INR'
qryg set terminal kitty
qryg feature off bounce preview
qryg bookmark add docs ~/Documents
qryg reset --all
```

The full reference is in the [wiki](https://github.com/ru-dr/qryg-search/wiki).

## Troubleshooting

- **The bar is invisible, or typing does nothing.** Another extension is hiding the Overview search, such as Just Perfection's *Search* option. Turn that option back on.
- **`Super + Space` does nothing.** Run `qryg doctor`, which lists anything else bound to the same keys.
- **A new file doesn't show up.** plocate reindexes once a day. Run `sudo updatedb` to refresh it now.
- **A plugin doesn't load.** It is listed under *Not loaded* in Preferences → Plugins, with the reason. `journalctl --user -f -o cat | grep qryg-search` shows its log.
- **Code changes don't apply.** On Wayland, GNOME Shell only reloads extension code at login. Settings and plugin reloads are live.

## Development

```bash
npm install          # ESLint, for make lint
make check           # syntax, schema, lint, JS and Python tests
make link            # install as a symlink
make zip             # build an extensions.gnome.org bundle
```

The code is laid out like this:

| Path | Contents |
|---|---|
| `lib/core` | Config, patching and stylesheets |
| `lib/overview` | Taking over Overview search |
| `lib/results` | Result list layout and preview |
| `lib/launcher` | The window, keys and actions |
| `lib/plugins` | The plugin host |
| `plugins/` | Bundled plugins |
| `prefs/` | Preferences pages |
| `cli/` | The `qryg` tool |

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and release process.

## Credits

QryG started as a fork of [Spotlight](https://github.com/itsnin/spotlight) by itsnin. Built by the community, for the community.

Licensed under [GPL-3.0-or-later](LICENSE).

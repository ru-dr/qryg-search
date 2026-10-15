# Writing QryG Search plugins

Every feature in QryG beyond GNOME's own apps and search providers is a plugin, including the calculator, shell, files and web search. Your plugins get the same API.

This guide covers **Plugin API v1**.

- [Quick start](#quick-start)
- [How a plugin runs](#how-a-plugin-runs)
- [manifest.json](#manifestjson)
- [JavaScript plugins](#javascript-plugins)
- [Script plugins](#script-plugins)
- [Long-running script plugins](#long-running-script-plugins)
- [Results](#results)
- [Ranking](#ranking)
- [Effects](#effects)
- [Actions](#actions)
- [Previews](#previews)
- [Icons](#icons)
- [Settings](#settings)
- [Prefixes](#prefixes)
- [Debugging](#debugging)
- [Sharing a plugin](#sharing-a-plugin)

## Quick start

```bash
qryg-search plugin new weather                            # JavaScript
qryg-search plugin new notes --type script --lang python  # Python
qryg-search plugin new todo --type script --lang bash     # Bash
```

This creates `~/.local/share/qryg-search/plugins/<id>/` with a manifest and a working starting file, then reloads plugins. Open QryG and type the prefix (by default the first word of the id, for example `weather hi`).

After editing, run `qryg-search plugin reload` or press **Reload** in Preferences → Plugins. You don't need to log out, even for JavaScript.

The finished examples in [`examples/plugins`](../examples/plugins) are a good place to start:

| Example | Type | Shows |
|---|---|---|
| `hello` | JavaScript | Results, copy, a custom action button, a preview, a setting |
| `emoji` | Python script | The script protocol, a choice setting, preview details. QryG bundles a full JavaScript emoji plugin with the same id, which this example replaces when installed. |
| `fd-files` | Python script | Another file search backend, using `fd` and falling back to `find`. Change its id to `files` to replace the bundled one. |

Install one with `qryg-search plugin install examples/plugins/emoji`.

## How a plugin runs

1. At startup, and on every reload, QryG scans the bundled `plugins/` folder and `~/.local/share/qryg-search/plugins/`. A user plugin with the same `id` as a bundled one replaces it.
2. Each folder needs a `manifest.json`. An invalid manifest is skipped and listed under *Not loaded* in Preferences → Plugins, with the reason.
3. For every keystroke, QryG asks each enabled plugin for results through `query`. Slow or stale queries are cancelled.
4. When the user presses `Enter` or clicks a row button, QryG runs the result's effect or calls your `activate`.

A plugin is shown in normal results when `global` is true. It is always shown when the user types its prefix, and when the filter matching its `category` is active.

## manifest.json

```json
{
  "id": "weather",
  "name": "Weather",
  "description": "Current weather for a city.",
  "version": "1.0.0",
  "author": "you",
  "api": 1,
  "type": "js",
  "main": "plugin.js",
  "keyword": "wx",
  "global": false,
  "position": "bottom",
  "priority": 50,
  "category": "general",
  "icon": "weather-few-clouds-symbolic",
  "minQueryLength": 1,
  "completion": true,
  "timeout": 1500,
  "settings": []
}
```

| Field | Required | Default | Meaning |
|---|---|---|---|
| `id` | yes | — | Lowercase letters, digits and dashes, up to 41 characters. Must be unique. |
| `name` | yes | — | Shown as the section title and in preferences. |
| `type` | yes | — | `"js"` or `"script"`. |
| `main` | yes* | — | `js`: the module, ending in `.js`. `script`: an executable file in the folder (`chmod +x`). |
| `command` | no | — | `script` only: an argv array used instead of `main`, such as `["node", "plugin.mjs"]`. |
| `api` | no | `1` | The plugin API version it was written for. QryG refuses plugins that need a newer API. |
| `keyword` | no | none | The default prefix. 1 to 12 characters without spaces. See [Prefixes](#prefixes). |
| `global` | no | `true` | Show results without the prefix. Set this to `false` for anything noisy or slow. |
| `position` | no | `"bottom"` | `"top"` (above apps), `"after-apps"`, or `"bottom"` (after GNOME's providers). |
| `priority` | no | `50` | Order within a position. Lower comes first. |
| `category` | no | `"general"` | `"apps"`, `"files"`, `"actions"`, `"clipboard"` or `"general"`. Ties the plugin to a filter button. |
| `minQueryLength` | no | `1` | The shortest query sent without the prefix. A query with the prefix is always sent, even when empty. |
| `completion` | no | `true` | Whether the top result's title can fill in the bar as inline completion. |
| `timeout` | no | `1500` | `script` only: the time limit in milliseconds for each request, from 100 to 10000. |
| `persistent` | no | `false` | `script` only: keep one process running instead of starting one per request. See [Long-running script plugins](#long-running-script-plugins). |
| `icon` | no | an add-on icon | The default icon for results and preferences. See [Icons](#icons). |
| `description`, `version`, `author` | no | — | Shown in preferences and `qryg-search plugin info`. |
| `settings` | no | `[]` | User settings. See [Settings](#settings). |

\* For `script` plugins, use either `main` or `command`.

## JavaScript plugins

JavaScript plugins run inside GNOME Shell as ES modules, so they are fast and can use any GNOME library (`gi://GLib`, `gi://Gio`, `gi://Soup` and so on). They export a default class:

```js
import Gio from 'gi://Gio';

export default class Weather {
    constructor(api) {
        this.api = api;
    }

    async query({query, cancellable}) {
        if (!query)
            return [{title: 'Type a city', icon: 'weather-few-clouds-symbolic'}];
        const text = await this._fetch(query, cancellable);
        return [{title: text, subtitle: query, copy: text}];
    }

    activate(result, action) {
        return {copy: result.title};
    }

    available() {
        return true;
    }

    destroy() {
    }
}
```

| Method | Required | Called |
|---|---|---|
| `query(ctx)` | yes | For each search. Returns an array of [results](#results), or a Promise of one. |
| `activate(result, action)` | no | When a result has no `run` or `activate` field. `action` is an action `id` or `null`. Return [effects](#effects) or `null`. |
| `available()` | no | Return `false` to hide the plugin's filter button, for example when a dependency is missing. |
| `destroy()` | no | On reload, disable and logout. Cancel timers, close files and disconnect signals here. |

`query` receives a context object:

| Field | Meaning |
|---|---|
| `query` | The text without the prefix, trimmed. |
| `raw` | The full text in the bar. |
| `forced` | `true` when the user typed this plugin's prefix. |
| `terms` | The words, as GNOME splits them. |
| `filter` | The active filter, `"apps"`, `"files"`, `"actions"` or `"clipboard"`, or `null` when there is none. |
| `cancellable` | A `Gio.Cancellable` that is cancelled when the query is out of date. Pass it to async calls. |

### The `api` object

| Member | Purpose |
|---|---|
| `api.id`, `api.name`, `api.dir` | The plugin id, name and folder. |
| `api.settings.get(key)`, `.set(key, value)`, `.all()` | Read and write this plugin's [settings](#settings). |
| `api.settings.onChanged(callback)` | Watch settings. Returns a function that stops watching, which you can call in `destroy()`. |
| `api.cacheDir`, `api.configDir` | `~/.cache/qryg-search/plugins/<id>` and `~/.config/qryg-search/plugins/<id>`, created on first use. |
| `api.copy(text)` | Copy to the clipboard. |
| `api.open(target)` | Open a path or URI with its default app. |
| `api.spawn(argv, cwd)` | Run a program in the background. |
| `api.terminal(command)` | Run a shell command in the user's terminal. |
| `api.findTerminal()` | The terminal QryG would use. |
| `api.notify(title, body)` | Show a notification. |
| `api.log(...args)` | Write to the journal, tagged with your id and rate limited. |
| `api.refresh()` | Search again with the current text, for example when data arrives in the background. |
| `api.expandPath(path)`, `api.tildify(path)` | Convert between `~/x` and `/home/you/x`. |

Keep `query` quick, because it runs in the GNOME Shell process. Do I/O asynchronously, honour `cancellable`, and cache anything expensive. An exception in `query` is caught and logged, and only empties your section.

## Script plugins

A script plugin can be written in any language. QryG runs it once per request:

```
<main or command> <method>
```

`method` is `query` or `activate`. One line of JSON is written to stdin, and the plugin writes one JSON value to stdout.

**`query`**

```json
{"method": "query", "query": "fire", "raw": ": fire", "forced": true, "filter": null, "settings": {"skin-tone": "none"}}
```

The reply is `{"results": [...]}` or a plain array of [results](#results).

**`activate`** (sent only when the selected result has no `activate` field)

```json
{"method": "activate", "result": {"title": "…", "…": "…"}, "action": "notify", "settings": {}}
```

The reply is an [effects](#effects) object, or `{}`.

The environment:

| Variable | Value |
|---|---|
| `QRYG_SEARCH_PLUGIN_ID` | The plugin id |
| `QRYG_SEARCH_PLUGIN_DIR` | The plugin folder (also the working directory) |
| `QRYG_SEARCH_CACHE_DIR` | `~/.cache/qryg-search/plugins/<id>` |
| `QRYG_SEARCH_CONFIG_DIR` | `~/.config/qryg-search/plugins/<id>` |

The limits:

- the process is killed after `timeout` milliseconds, or when the user keeps typing
- output over 512 KB is rejected
- stderr is discarded, so print debug output to a file
- every keystroke starts a new process, so keep startup fast, or use a [long-running process](#long-running-script-plugins)

A minimal Bash plugin:

```bash
#!/usr/bin/env bash
read -r request
case "$1" in
  query)
    q=$(jq -r .query <<<"$request")
    jq -n --arg q "$q" '{results: [{title: ($q | ascii_upcase), copy: ($q | ascii_upcase)}]}'
    ;;
  *) echo '{}' ;;
esac
```

## Long-running script plugins

Starting a process on every keystroke is fine for small scripts. It is slow for anything that loads a big library or an index. Set `"persistent": true` and QryG starts the process once, the first time it is needed, and keeps it running:

```
<main or command> serve
```

Each request is one line of JSON on stdin with an `id`. Each reply is one line of JSON on stdout with the same `id`:

```
→ {"id": 7, "method": "query", "query": "fire", "raw": ": fire", "forced": true, "filter": null, "settings": {}}
← {"id": 7, "results": [{"title": "🔥 fire", "copy": "🔥"}]}
```

- Flush stdout after every line. In Python, use `print(..., flush=True)`.
- Replies can arrive in any order. QryG matches them by `id`, and ignores replies to queries the user has already typed past.
- Your process can send lines of its own at any time:
  - `{"method": "refresh"}` makes QryG search again, for example when background data arrives
  - `{"method": "log", "message": "…"}` writes to the journal
- If the process exits, QryG restarts it on the next request. After three crashes within a minute it stops trying until plugins are reloaded.
- The process is stopped on reload, when the plugin is disabled, and at logout.

```python
for line in sys.stdin:
    request = json.loads(line)
    reply = query(request) if request["method"] == "query" else {}
    print(json.dumps({"id": request["id"], **reply}), flush=True)
```

The `emoji` example and `qryg-search plugin new --type script` support both modes, so you can switch with one manifest field.

## Results

Only `title` is required. JavaScript results can also use functions where noted, while script results are plain JSON.

```js
{
    id: 'paris',
    title: 'Paris: 18 °C',
    subtitle: 'Partly cloudy',
    icon: 'weather-few-clouds-symbolic',
    copy: '18 °C',
    activate: {open: 'https://wttr.in/paris'},
    run: () => {},
    actions: [],
    preview: {},
    path: '~/Documents/report.pdf',
    bookmark: 'https://wttr.in/paris',
    bookmarkName: 'Paris weather',
    kind: 'Weather',
}
```

| Field | Meaning |
|---|---|
| `title` | The main text. Results without one are dropped. |
| `subtitle` | The secondary text. |
| `id` | A stable id, which keeps the selection steady as results update. Defaults to the position in the list. |
| `icon` | See [Icons](#icons). Defaults to the manifest icon. |
| `copy` | The text that `Ctrl + Shift + C` copies, and the fallback for `Enter`. |
| `activate` | [Effects](#effects) for `Enter`. |
| `run` | JavaScript only: a function for `Enter`. Takes precedence over `activate`. |
| `actions` | Up to four row buttons. See [Actions](#actions). |
| `preview` | The preview pane. See [Previews](#previews). |
| `path` | A file path. Enables *Show in folder* and is the copy fallback. |
| `bookmark`, `bookmarkName` | Enables `Ctrl + D` and the ☆ button. The target can be a path, URL or `> command`. |
| `kind` | The small line under the title in the preview. Defaults to the plugin name. |
| `score` | How good a match this is, from 0 to 100. See [Ranking](#ranking). |

Up to 50 results are kept per query. Results with a `score` are sorted by it, highest first. QryG shows the first few, depending on `max-rows`.

`Enter` runs the first of these that exists:

1. `run()`
2. `activate` effects
3. your plugin's `activate(result, null)`
4. copying `copy`

The window closes afterwards.

## Ranking

Sections are ordered by a score. A section without scored results uses the base score of its position:

| Section | Base score |
|---|---|
| Plugins with `"position": "top"` | 90 |
| Apps | 80 |
| Plugins with `"position": "after-apps"` | 70 |
| GNOME search providers | 50 |
| Plugins with `"position": "bottom"` | 30 |

If your results set `score`, your section uses the highest one instead, and moves when it beats another section. The first row of the first section is the Top Hit.

For example, a file search plugin at the bottom can return `"score": 95` for an exact file name match, and it moves above the apps. Without any scores, the order is the same as the table. Sections with the same score keep their `priority` order.

Give an honest score:

| Score | Meaning |
|---|---|
| 90 and up | Certainly what the user wants, such as an exact match |
| 60 to 89 | A strong match |
| 30 to 59 | A partial match |
| Below 30 | Only worth showing if nothing else matches |

## Effects

Effects describe what should happen, so script plugins can act without any API. Combine as many as you like:

```json
{"copy": "text", "open": "~/Downloads", "exec": ["gnome-text-editor", "notes.txt"], "terminal": "htop", "notify": "Done"}
```

| Key | Does |
|---|---|
| `copy` | Copies the text |
| `open` | Opens a path, `file://`, `https://` or any URI with its default handler |
| `exec` | Runs an argv array in the background, without a shell, from the plugin folder |
| `terminal` | Runs a shell command in the user's terminal |
| `notify` | Shows a notification |

## Actions

Actions are buttons on the selected row, shown before the built-in ones.

```js
actions: [
    {id: 'forecast', label: 'Open forecast', icon: 'go-next-symbolic', open: 'https://wttr.in/paris'},
    {id: 'notify', label: 'Notify me', icon: 'preferences-system-notifications-symbolic'},
]
```

When an action is clicked, QryG runs the first of these that exists:

1. the action's `run()` function (JavaScript only)
2. its own [effects](#effects)
3. your plugin's `activate(result, action.id)`

## Previews

The pane beside the results shows the selected row's `preview`. In JavaScript, `preview` can be a function, which is called only when the row is selected.

```js
preview: {
    title: 'Paris',
    kind: 'Weather',
    icon: 'weather-few-clouds-symbolic',
    image: '~/Pictures/map.png',
    swatches: ['#0a84ff', {color: '#ff375f', label: 'Pink', base: true}],
    code: 'monospace output\nup to 22 lines',
    body: 'A paragraph of text.',
    details: [['Humidity', '64 %'], ['Wind', '12 km/h']],
}
```

All fields are optional, and they appear from top to bottom in this order:

- **One visual:** `swatches` (up to 8, and clicking one copies it), else `image` (a file path), else `icon`
- `title`
- `kind`
- `code`
- `body`
- `details`, as label and value pairs

## Icons

Wherever an icon is accepted, you can give:

- **A theme icon name:** `"weather-few-clouds-symbolic"`
- **A file:** `"/abs/path.svg"`, `"~/x.png"`, or `"./icon.svg"` (relative to the plugin folder)
- **A colour swatch:** `{"color": "#ff375f"}`
- **An app's icon:** `{"app": "org.gnome.Nautilus.desktop"}`
- **A `Gio.Icon` (JavaScript only):** `{gicon}`
- **A function (JavaScript only):** `size => actor`, which returns any St actor

## Settings

Settings declared in the manifest appear under the plugin in Preferences → Plugins, and in the CLI:

```json
"settings": [
  {"key": "city", "type": "string", "default": "Paris", "title": "Default city"},
  {"key": "units", "type": "choice", "choices": ["metric", "imperial"], "default": "metric", "title": "Units"},
  {"key": "days", "type": "int", "min": 1, "max": 7, "default": 3, "title": "Forecast days"},
  {"key": "alerts", "type": "bool", "default": true, "title": "Show alerts"},
  {"key": "favourites", "type": "strings", "default": [], "title": "Favourite cities"}
]
```

| Field | Meaning |
|---|---|
| `key` | The setting name |
| `type` | `bool`, `int`, `string`, `strings` (a list) or `choice` |
| `default` | The default value |
| `title`, `description` | Labels shown in preferences |
| `min`, `max` | Limits, for `int` |
| `choices` | The options, for `choice` |

Values are stored for you, and invalid values fall back to `default`. Read them with `api.settings.get(key)` in JavaScript, or from `settings` in each script request.

```bash
qryg-search plugin config weather              # show settings
qryg-search plugin config weather city Berlin  # change one
```

## Prefixes

The `keyword` in the manifest is only a default. Users can change it, or remove it, without touching your plugin:

```bash
qryg-search keyword weather w
qryg-search keyword weather none
qryg-search keyword weather default
```

- A prefix that starts with a letter or digit, such as `wx`, needs a space after it: `wx paris`.
- A symbol prefix, such as `~`, works without one: `~paris`.
- When prefixes overlap, the longest one wins.
- `qryg-search doctor` reports prefixes used by two plugins.

Pick a short word over a symbol. Single symbols are scarce, and the bundled plugins already use `= > ? * :`.

## Debugging

```bash
journalctl --user -f -o cat | grep qryg-search   # api.log output, load errors, query errors
qryg-search plugin list                          # state, prefix and folder of every plugin
qryg-search plugin info weather                  # prefix, state, folder and settings
qryg-search plugin reload
```

- A script plugin can be tested without QryG: `echo '{"query":"paris"}' | ./plugin.py query`.
- A reload loads a fresh copy of your `main` module. Helper modules it imports stay cached until the next login, so during development keep code you change often in `main`.
- A syntax error in `plugin.js` shows up under *Not loaded* in preferences.

## Sharing a plugin

Put the plugin folder at the root of a git repository. Anyone can then install it:

```bash
qryg-search plugin install https://github.com/you/qryg-search-weather
qryg-search plugin install ./my-local-folder --link    # symlink, for development
qryg-search plugin update                              # update every plugin installed from git or a folder
qryg-search plugin update weather
qryg-search plugin remove weather
```

Before publishing, check the following:

- `id` is unique and `api` is `1`
- `version` goes up with every release, so `qryg-search plugin update` can report it
- `global` is `false`, unless the plugin is fast and rarely noisy
- network calls are cached and cancellable
- there are no secrets in the repository; use a setting for API keys
- it has a licence, ideally GPL-3.0-or-later like QryG

Open an issue on [ru-dr/qryg-search](https://github.com/ru-dr/qryg-search/issues) to have your plugin listed.

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
- [Usage guide](#usage-guide)
- [Debugging](#debugging)
- [Sharing a plugin](#sharing-a-plugin)

## Quick start

```bash
qryg plugin new weather                            # JavaScript
qryg plugin new notes --type script --lang python  # Python
qryg plugin new todo --type script --lang bash     # Bash
```

This creates `~/.local/share/qryg-search/plugins/<id>/` with a manifest and a working starting file, then reloads plugins. Open QryG and type the prefix (by default the first word of the id, for example `weather hi`). Replace the starter `examples` in the manifest with your own: every plugin needs a prefix and a usage guide.

After editing, run `qryg plugin reload` or press **Reload** in Preferences → Plugins. You don't need to log out, even for JavaScript.

The finished examples in [`examples/plugins`](../examples/plugins) are a good place to start:

| Example | Type | Shows |
|---|---|---|
| `hello` | JavaScript | Results, copy, a custom action button, a preview, a setting |
| `emoji` | Python script | The script protocol, a choice setting, preview details. QryG bundles a full JavaScript emoji plugin with the same id, which this example replaces when installed. |
| `fd-files` | Python script | Another file search backend, using `fd` and falling back to `find`. Change its id to `files` to replace the bundled one. |

Install one with `qryg plugin install examples/plugins/emoji`.

## How a plugin runs

1. At startup, and on every reload, QryG scans the bundled `plugins/` folder and `~/.local/share/qryg-search/plugins/`. A user plugin with the same `id` as a bundled one replaces it.
2. Each folder needs a `manifest.json`. An invalid manifest is skipped and listed under *Not loaded* in Preferences → Plugins, with the reason.
3. For every keystroke, QryG asks each enabled plugin for results through `query`. Stale queries are cancelled, and a query that takes longer than the manifest `timeout` is cancelled and counted as an error.
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
  "examples": [
    ["paris", "The weather in Paris"],
    ["", "The weather where you are"]
  ],
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
| `api` | no | `1` | The plugin API version it was written for, a whole number; `null` counts as left out. QryG refuses plugins that need a newer API. |
| `keyword` | yes | — | The default prefix. 1 to 12 characters without spaces. See [Prefixes](#prefixes). |
| `examples` | yes | — | The usage guide: 1 to 10 `["what to type", "what it does"]` pairs. See [Usage guide](#usage-guide). |
| `global` | no | `true` | Show results without the prefix. Set this to `false` for anything noisy or slow. |
| `position` | no | `"bottom"` | `"top"` (above apps), `"after-apps"`, or `"bottom"` (after GNOME's providers). |
| `priority` | no | `50` | Order within a position. Lower comes first. |
| `category` | no | `"general"` | `"apps"`, `"files"`, `"actions"`, `"clipboard"` or `"general"`. Ties the plugin to a filter button. |
| `minQueryLength` | no | `1` | The shortest query sent without the prefix. A query with the prefix is always sent, even when empty. |
| `completion` | no | `true` | Whether the top result's title can fill in the bar as inline completion. |
| `timeout` | no | `1500` | The time limit in milliseconds for each query, and for each script request, from 100 to 10000. |
| `persistent` | no | `false` | `script` only: keep one process running instead of starting one per request. See [Long-running script plugins](#long-running-script-plugins). |
| `startupTimeout` | no | `5000` | Persistent `script` only: extra milliseconds allowed while the process starts, from 0 to 30000. |
| `toggle` | no | — | The name of a boolean QryG setting that also turns the plugin on and off. Only bundled plugins can use it; it is ignored for installed ones. |
| `icon` | no | an add-on icon | The default icon for results and preferences. See [Icons](#icons). |
| `description`, `version`, `author` | no | — | Shown in preferences and `qryg plugin info`. |
| `settings` | no | `[]` | User settings. See [Settings](#settings). |
| `files` | no | `[]` | Other files the plugin needs, as paths relative to the manifest, such as `["lib/api.js", "icons/logo.svg"]`. Only used when someone installs from a `manifest.json` URL. See [Sharing a plugin](#sharing-a-plugin). |

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
| `enable()` | no | After loading when the plugin is on, and whenever the user turns it back on. |
| `disable()` | no | When the user turns the plugin off in preferences or with `qryg plugin disable`. The plugin stays loaded, so free anything heavy here and restore it in `enable()`. |
| `destroy()` | no | On reload, when the extension is disabled, and at logout. Cancel timers, close files and disconnect signals here. `disable()` is not called first. |

`query` receives a context object:

| Field | Meaning |
|---|---|
| `query` | The text without the prefix, trimmed. |
| `raw` | The full text in the bar. |
| `forced` | `true` when the user typed this plugin's prefix. |
| `terms` | The words, as GNOME splits them. |
| `filter` | The active filter, `"apps"`, `"files"`, `"actions"` or `"clipboard"`, or `null` when there is none. |
| `cancellable` | A `Gio.Cancellable` that is cancelled when the query is out of date or runs past `timeout`. Pass it to async calls. |

### The `api` object

| Member | Purpose |
|---|---|
| `api.id`, `api.name`, `api.dir` | The plugin id, name and folder. |
| `api.settings.get(key)`, `.set(key, value)`, `.all()` | Read and write this plugin's [settings](#settings). |
| `api.settings.onChanged(callback)` | Watch this plugin's settings. `callback(keys)` gets the keys whose values changed. Returns a function that stops watching. Stops by itself on destroy. |
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
| `api.timeout(ms, fn)` | Run `fn` after `ms` milliseconds. Return `true` from `fn` to run it again. Returns a function that cancels it. |
| `api.idle(fn)` | Run `fn` when GNOME Shell is idle. Return `true` to run it again. Returns a function that cancels it. |
| `api.connect(object, signal, fn)` | Connect to a GObject signal. Returns a function that disconnects it. |
| `api.fetchJson(url, options)` | Fetch and parse JSON over HTTP. See [Helpers](#helpers). |
| `api.match(text, query)` | Score how well `query` matches `text`, from 0 to 100, or `null`. See [Helpers](#helpers). |
| `api.matchWords(fields, query)` | Like `api.match`, but every word of `query` must appear somewhere in `fields`, a string or an array of strings, in any order. |
| `api.readText(path, cancellable)` | A Promise of a file's text, or `''` when it can't be read. |
| `api.copyRow(title, subtitle, icon, extra)` | A result that copies `extra.copy`, or else `title`, on Enter. Other fields of `extra`, such as `preview` or `score`, are added to it. |
| `api.warningRow(title, subtitle)` | A result with a warning icon, for input the plugin can't use. |

Timers, idle callbacks, signal connections and settings watches made through `api` are removed when the plugin is destroyed, so you don't need to track them yourself. Calling a returned stop function early is safe.

Keep `query` quick, because it runs in the GNOME Shell process. Do I/O asynchronously, honour `cancellable`, and cache anything expensive. An exception in `query` is caught and logged, and only empties your section. So does a query that takes longer than `timeout`: QryG cancels `cancellable` and stops waiting for it.

### Helpers

`api.fetchJson(url, {cancellable, ttl, headers})` returns a Promise of the parsed JSON body:

- every plugin shares one HTTP session, created on first use, with a 10 second network timeout
- `ttl` caches the reply in `api.cacheDir` for that many seconds, and while the copy is fresh no request is made. When a request fails and a cached copy exists, even an old one, the old copy is returned.
- `headers` is an object of request headers, such as `{Authorization: 'Bearer …'}`
- a reply that isn't 2xx, or isn't valid JSON, rejects the Promise
- requests still running are cancelled when the plugin is destroyed

```js
const data = await this.api.fetchJson('https://open.er-api.com/v6/latest/USD', {cancellable, ttl: 12 * 3600});
```

`api.match(text, query)` scores a fuzzy match, ignoring case and accents. Use the result as a result's [`score`](#ranking):

| Match | Score |
|---|---|
| `text` equals `query` | 100 |
| `text` starts with `query` | 80 to 90 |
| a word in `text` starts with `query` | 60 to 75 |
| `query` appears inside a word | 40 to 55 |
| the letters of `query` appear in order, such as `vsc` in `Visual Studio Code` | 10 to 35 |
| no match | `null` |

Within each band, a query that covers more of the text scores higher. An empty query scores 0.

```js
return this._items
    .map(item => ({title: item.name, score: this.api.match(item.name, query)}))
    .filter(result => result.score !== null);
```

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
| `QRYG_SEARCH_CACHE_DIR` | `~/.cache/qryg-search/plugins/<id>`, created before the script starts |
| `QRYG_SEARCH_CONFIG_DIR` | `~/.config/qryg-search/plugins/<id>`, created before the script starts |

The limits:

- the process is killed after `timeout` milliseconds, or when the user keeps typing
- output over 512 KB is rejected
- a non-zero exit status is an error, reported as `exit N:` and the last line of stderr; otherwise stderr is discarded, so print debug output to a file
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
  - `{"method": "ready"}` says startup is done
  - `{"method": "error", "message": "…"}` reports a problem, which shows under the plugin in Preferences → Plugins
- Until the process prints its first line, requests are allowed `timeout` plus `startupTimeout` milliseconds, so a slow start doesn't fail the first query. Print `{"method": "ready"}` as soon as you can answer.
- If the process exits, QryG restarts it on the next request. If it leaves three requests in a row unanswered, QryG ends it, and the next request starts a new one. After three crashes or restarts within a minute it stops trying until plugins are reloaded.
- The process is stopped on reload, when the plugin is disabled, and at logout. When the plugin is turned back on, the next request starts it again.

```python
for line in sys.stdin:
    request = json.loads(line)
    reply = query(request) if request["method"] == "query" else {}
    print(json.dumps({"id": request["id"], **reply}), flush=True)
```

The `emoji` example and `qryg plugin new --type script` support both modes, so you can switch with one manifest field.

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
3. your plugin's `activate(result, null)`, when it returns at least one [effect](#effects)
4. copying `copy`, or `path` when there is no `copy`

The window closes afterwards.

## Ranking

Sections are grouped by kind first, in the order people choose under **Preferences → Features → Result priority** (or `qryg set result-priority`). The default is apps, actions, files, other, clipboard. Your plugin's kind is its `category`: `apps`, `actions`, `files` or `clipboard`, and `general` counts as other. GNOME's apps and system actions are apps, its Settings and Calculator are actions, and other GNOME search providers are other. The first section with a match gives the Top Hit.

Within one kind, sections are ordered by a score. A section without scored results uses the base score of its position:

| Section | Base score |
|---|---|
| Plugins with `"position": "top"` | 90 |
| Apps | 80 |
| Plugins with `"position": "after-apps"` | 70 |
| GNOME search providers | 50 |
| Plugins with `"position": "bottom"` | 30 |

If your results set `score`, your section uses the highest one instead, and moves when it beats another section of the same kind. A score never moves a section past a kind that comes earlier in the result priority.

For example, a bookmarks plugin at the bottom can return `"score": 95` for an exact name match, and it moves above other `general` sections such as web search. Without any scores, the order is the same as the table. Sections with the same score keep their `priority` order.

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
| `terminal` | Runs a shell command in the user's terminal, from the home folder |
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
- `examples`, as `["what to type", "what it does"]` pairs, each shown as a block. The pair whose first text equals `current` is highlighted. QryG uses this for the [usage guide](#usage-guide).

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

Values are stored for you, and invalid values fall back to `default`. That includes an `int` outside `min` and `max`. Read them with `api.settings.get(key)` in JavaScript, or from `settings` in each script request.

```bash
qryg plugin config weather              # show settings
qryg plugin config weather city Berlin  # change one
```

The CLI refuses values that would fall back: a number outside `min` and `max`, a choice that isn't listed, or a `bool` that isn't a word like `on`, `off`, `true` or `false`.

## Prefixes

The `keyword` in the manifest is only a default. Users can change it, or remove it, without touching your plugin:

```bash
qryg keyword weather w
qryg keyword weather none
qryg keyword weather default
```

- A prefix that starts with a letter or digit, such as `wx`, needs a space after it: `wx paris`.
- A symbol prefix, such as `~`, works without one: `~paris`.
- When prefixes overlap, the longest one wins.
- `qryg doctor` reports prefixes used by two plugins.

Every plugin needs a `keyword`. A manifest without one is not loaded and can't be installed. A plugin with `"global": true` still answers without its prefix; the prefix is how users reach it on purpose and see its guide.

Pick a short word over a symbol. Single symbols are scarce, and the bundled plugins already use `= > ? * :`. Avoid a word that starts app names, because a word prefix followed by a space hides every other result.

## Usage guide

Every plugin needs `examples`: pairs of what to type and what it does. A manifest without them is not loaded and can't be installed.

```json
"examples": [
  ["paris", "The weather in Paris"],
  ["", "The weather where you are"]
]
```

- The first text is what to type after the prefix. Leave the prefix out: QryG adds the user's current one, so `paris` appears as `wx paris`, or `w paris` after `qryg keyword weather w`. An empty text means the prefix alone.
- The second is one short sentence.
- Use 1 to 10 examples, most useful first, and make each one work: `qryg plugin test weather paris` runs it.

The guide appears in three places:

- **The search bar.** The prefix alone, like `wx ` or `=`, shows the examples first and your plugin's results for an empty query after them. So does a query your plugin has no results for, or one that fails, with the examples closest to what was typed first. This works the same for every plugin. `Tab` completes the top example and `Enter` fills in the selected one. An example of the prefix alone is left out of the bar, because it is already typed, but it stays in the preview.
- **Preferences → Plugins**, under *How to use* on the plugin's row.
- **`qryg plugin info ID`**, under *how to use*.

## Debugging

```bash
journalctl --user -f -o cat | grep qryg-search   # api.log output, load errors, query errors
qryg plugin list                          # state, prefix and folder of every plugin
qryg plugin info weather                  # prefix, state, folder, settings and usage guide
qryg plugin validate weather              # check the manifest, by id or folder
qryg plugin test weather paris            # run one query and print the results
qryg plugin test weather paris --activate 1   # also show what Enter on result 1 does
qryg plugin reload weather                # reload one plugin
qryg plugin reload                        # reload every plugin
```

- `plugin validate` takes an id or a folder. It prints the problems that stop a plugin loading, and warnings for unknown fields and values that QryG quietly replaces with a default.
- `plugin test` takes an id or a folder, and runs the query outside GNOME Shell, as if the prefix was typed. Script plugins run exactly as QryG runs them, with the same environment, working directory, settings, `timeout` and size limit, and persistent ones through `serve`. JavaScript plugins run under `gjs` with a stand-in `api`: effects and calls like `api.copy` are printed, not performed. A JavaScript plugin that imports GNOME Shell modules can only be tested in GNOME Shell.
- A script plugin can also be tested by hand: `echo '{"query":"paris"}' | ./plugin.py query`.
- A reload loads a fresh copy of your `main` module. Helper modules it imports stay cached until the next login, so during development keep code you change often in `main`.
- A syntax error in `plugin.js`, or an exception in your constructor, shows up under *Not loaded* in preferences.
- Errors and timeouts while running show as a warning on the plugin in preferences, with the last error. They are counted until the next reload.

## Sharing a plugin

> [!WARNING]
> Plugins run code on your computer. A JavaScript plugin runs inside GNOME Shell with full access to your session; a script plugin runs as your user. Only install plugins from sources you trust, and read the code first.

Publish the plugin folder anywhere QryG can fetch it from. `qryg plugin install` works out what a source is from its shape:

| Source | Example | What QryG does |
|---|---|---|
| A local folder | `./weather` | Copies it. Add `--link` to symlink it instead, for development. |
| A git repository | `https://github.com/you/qryg-search-weather`, `git@github.com:you/weather.git`, `ssh://…` | Shallow clone of the default branch. |
| A folder in a repository | `https://github.com/you/plugins/tree/main/weather` | Fetches only that folder at that branch, tag or commit. GitHub and Codeberg `…/tree/…`, `…/blob/…/manifest.json` and `…/src/branch/…` links work, and so do GitLab `…/-/tree/…` links. |
| An archive | `https://example.com/weather-1.2.zip`, `.tar.gz`, `.tgz`, `.tar.xz` | Downloads and unpacks it. The plugin can be at the top or in a single top-level folder, as in GitHub's release archives. |
| A `manifest.json` URL | `https://raw.githubusercontent.com/you/plugins/main/weather/manifest.json` | Downloads the manifest, then `main` and every path in `files`, from next to it. A script `main` is made executable. |

```bash
qryg plugin install https://github.com/you/qryg-search-weather
qryg plugin install https://github.com/you/plugins/tree/main/weather
qryg plugin install ./my-local-folder --link    # symlink, for development
qryg plugin update                              # update every plugin that has a recorded source
qryg plugin update weather
qryg plugin remove weather
```

If a repository has no `manifest.json` at its root, QryG looks one level down and in `plugins/`. One plugin there is installed. If there are several, QryG lists them and asks for the URL of one folder.

Before anything is written, QryG checks the manifest (`id`, `name`, `type`, `main`, and `api` no newer than QryG's) and shows what it is about to install: the name, id, version, author, what the plugin type can do, where it comes from, the folder it goes to, and the plugin it replaces, followed by the warning above with the source to review. It then asks `Install? [y/N]`. Pass `--yes` (`-y`) to skip the question; without a terminal, such as in a script, `--yes` is required. The new copy is built beside the old one and swapped in, so a failed install leaves the old plugin as it was.

Archives are checked before they are unpacked: no absolute paths, no `..`, no links pointing outside the plugin, and at most 50 MB. Downloads time out after 30 seconds. Whatever the source, a plugin with a link that leads outside its folder is refused, and links inside it are copied as links.

The source is recorded in `.qryg-search-source.json` inside the installed folder, as `{"source": "…", "kind": "git" | "subdir" | "archive" | "manifest" | "folder", "ref": "main" | null}`, which is what `qryg plugin update` fetches again.

In the preferences window, **Plugins → Install a plugin** takes the same sources. It shows the same summary before installing, then reloads plugins. It needs `git` for repositories, `tar` for `.tar.*` archives and `unzip` for `.zip` archives.

Before publishing, check the following:

- `id` is unique and `api` is `1`
- `version` goes up with every release, so `qryg plugin update` can report it
- if you share a `manifest.json` link, `files` lists every file besides `main`
- `global` is `false`, unless the plugin is fast and rarely noisy
- network calls are cached and cancellable
- there are no secrets in the repository; use a setting for API keys
- it has a licence, ideally GPL-3.0-or-later like QryG

Open an issue on [ru-dr/qryg-search](https://github.com/ru-dr/qryg-search/issues) to have your plugin listed.

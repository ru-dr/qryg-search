// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {HOME, expandPath, tildify} from '../core/paths.js';

export {HOME, expandPath, tildify};
const LOG_INTERVAL_US = 60 * 1000 * 1000;
const lastLog = new Map();
const TERMINALS = [
    ['ptyxis', cmd => ['ptyxis', '--new-window', '--', ...cmd]],
    ['kgx', cmd => ['kgx', '--', ...cmd]],
    ['gnome-terminal', cmd => ['gnome-terminal', '--', ...cmd]],
    ['kitty', cmd => ['kitty', ...cmd]],
    ['alacritty', cmd => ['alacritty', '-e', ...cmd]],
    ['foot', cmd => ['foot', ...cmd]],
    ['wezterm', cmd => ['wezterm', 'start', '--', ...cmd]],
    ['konsole', cmd => ['konsole', '-e', ...cmd]],
    ['xterm', cmd => ['xterm', '-e', ...cmd]],
];

export function userShell() {
    return GLib.getenv('SHELL') || '/bin/sh';
}

export function findTerminal(gsettings) {
    const wanted = gsettings.get_string('terminal');
    for (const [name, build] of TERMINALS) {
        if ((!wanted || wanted === name) && GLib.find_program_in_path(name))
            return {name, build};
    }
    if (wanted && GLib.find_program_in_path(wanted))
        return {name: wanted, build: cmd => [wanted, '-e', ...cmd]};
    return null;
}

export function runInTerminal(gsettings, command, cwd = HOME) {
    const shell = userShell();
    const term = findTerminal(gsettings);
    const inner = [shell, '-c', `${command}; printf '\\n[exit %s] ' "$?"; exec ${shell}`];
    GLib.spawn_async(cwd, term ? term.build(inner) : inner, null, GLib.SpawnFlags.SEARCH_PATH, null);
}

export function spawn(argv, cwd = HOME) {
    GLib.spawn_async(cwd, argv, null, GLib.SpawnFlags.SEARCH_PATH, null);
}

export function open(target) {
    const uri = /^[a-z][a-z0-9+.-]*:/i.test(target)
        ? target : GLib.filename_to_uri(expandPath(target), null);
    Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
}

export function copy(text) {
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, String(text));
}

export function notify(title, body = '') {
    Main.notify(String(title), String(body));
}

export function log(pluginId, ...args) {
    const now = GLib.get_monotonic_time();
    if (now - (lastLog.get(pluginId) ?? 0) < LOG_INTERVAL_US)
        return;
    lastLog.set(pluginId, now);
    console.warn(`qryg-search plugin ${pluginId}:`, ...args);
}

export function applyEffects(gsettings, effects, cwd) {
    if (!effects || typeof effects !== 'object')
        return;
    if (effects.copy !== undefined && effects.copy !== null)
        copy(effects.copy);
    if (typeof effects.open === 'string' && effects.open)
        open(effects.open);
    if (Array.isArray(effects.exec) && effects.exec.length > 0)
        spawn(effects.exec.map(String), cwd);
    if (typeof effects.terminal === 'string' && effects.terminal)
        runInTerminal(gsettings, effects.terminal);
    if (typeof effects.notify === 'string' && effects.notify)
        notify('QryG', effects.notify);
}

export function iconActor(spec, size, dir) {
    if (typeof spec === 'function')
        return spec(size);
    if (spec && typeof spec === 'object') {
        if (spec.color) {
            return new St.Widget({
                style: `background-color: ${spec.color}; border-radius: ${Math.round(size / 4)}px;`,
                width: size, height: size,
            });
        }
        if (spec.app) {
            const app = Shell.AppSystem.get_default().lookup_app(spec.app);
            if (app)
                return app.create_icon_texture(size);
        }
        if (spec.gicon)
            return new St.Icon({gicon: spec.gicon, icon_size: size});
        if (spec.file)
            spec = spec.file;
        else
            spec = null;
    }
    let gicon;
    if (typeof spec === 'string' && (spec.startsWith('/') || spec.startsWith('~') || spec.startsWith('./'))) {
        const path = spec.startsWith('./') ? GLib.build_filenamev([dir, spec.slice(2)]) : expandPath(spec);
        gicon = Gio.FileIcon.new(Gio.File.new_for_path(path));
    } else {
        gicon = new Gio.ThemedIcon({name: typeof spec === 'string' && spec ? spec : 'application-x-addon-symbolic'});
    }
    return new St.Icon({gicon, icon_size: size});
}

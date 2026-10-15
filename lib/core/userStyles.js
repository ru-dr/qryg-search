// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export const STYLES_DIR = GLib.build_filenamev([GLib.get_user_config_dir(), 'qryg-search', 'styles']);
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/;

function isValidStyleName(name) {
    return typeof name === 'string' && NAME.test(name);
}

export function stylePath(name) {
    return isValidStyleName(name) ? GLib.build_filenamev([STYLES_DIR, `${name}.css`]) : null;
}

export function listStyles() {
    const names = [];
    try {
        const it = Gio.File.new_for_path(STYLES_DIR).enumerate_children('standard::name',
            Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = it.next_file(null)) !== null) {
            const name = info.get_name();
            if (name.endsWith('.css') && isValidStyleName(name.slice(0, -4)))
                names.push(name.slice(0, -4));
        }
        it.close(null);
    } catch {}
    return names.sort();
}

export function readStyle(name) {
    const path = stylePath(name);
    if (!path)
        return null;
    try {
        return new TextDecoder().decode(GLib.file_get_contents(path)[1]);
    } catch {
        return null;
    }
}

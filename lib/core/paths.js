// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';

export const HOME = GLib.get_home_dir();

function fromUri(uri) {
    try {
        return GLib.filename_from_uri(uri)[0];
    } catch {
        return uri;
    }
}

export function expandPath(path) {
    const local = path.startsWith('file://') ? fromUri(path) : path;
    return local.replace(/^~(?=\/|$)/, HOME);
}

export function tildify(path) {
    return path === HOME || path.startsWith(`${HOME}/`) ? `~${path.slice(HOME.length)}` : path;
}

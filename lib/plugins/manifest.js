// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {API_VERSION, manifestProblems, normalizeManifest} from './rules.js';

export {isValidKeyword, isWordKeyword} from './guide.js';
export {API_VERSION, providerId} from './rules.js';

export const USER_PLUGIN_DIR = GLib.build_filenamev([GLib.get_user_data_dir(), 'qryg-search', 'plugins']);

function readJson(path) {
    const [, bytes] = GLib.file_get_contents(path);
    return JSON.parse(new TextDecoder().decode(bytes));
}

export function hasFileIn(dir) {
    return (path, executable) => {
        const file = GLib.build_filenamev([dir, path]);
        return GLib.file_test(file, GLib.FileTest.IS_REGULAR) &&
            (!executable || GLib.file_test(file, GLib.FileTest.IS_EXECUTABLE));
    };
}

function listDir(dir) {
    const out = [];
    try {
        const it = Gio.File.new_for_path(dir).enumerate_children('standard::name,standard::type',
            Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = it.next_file(null)) !== null) {
            if (info.get_file_type() === Gio.FileType.DIRECTORY ||
                info.get_file_type() === Gio.FileType.SYMBOLIC_LINK)
                out.push(GLib.build_filenamev([dir, info.get_name()]));
        }
        it.close(null);
    } catch {}
    return out.sort();
}

export function scan(bundledDir) {
    const found = new Map();
    const broken = [];
    for (const [base, bundled] of [[bundledDir, true], [USER_PLUGIN_DIR, false]]) {
        if (!base)
            continue;
        for (const dir of listDir(base)) {
            const file = GLib.build_filenamev([dir, 'manifest.json']);
            if (!GLib.file_test(file, GLib.FileTest.EXISTS))
                continue;
            let raw;
            try {
                raw = readJson(file);
            } catch (e) {
                broken.push({dir, problems: [`manifest.json: ${e.message}`]});
                continue;
            }
            const problems = manifestProblems(raw, hasFileIn(dir), API_VERSION);
            if (problems.length > 0)
                broken.push({dir, id: raw?.id, problems});
            else
                found.set(raw.id, {...normalizeManifest(raw, bundled), dir});
        }
    }
    return {plugins: [...found.values()], broken};
}

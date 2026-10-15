// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import {readText} from '../../lib/plugins/helpers.js';
import {matchWords} from '../../lib/plugins/text.js';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');
Gio._promisify(Gio.File.prototype, 'query_info_async');
Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');

const HOME = GLib.get_home_dir();
const MAX_CANDIDATES = 50000;
const FRESH_TTL_US = 30 * 1000 * 1000;
const MAX_RESULTS = 20;
const SKIP_SEGMENTS = new Set(['node_modules', '__pycache__', 'site-packages', 'dist-packages', 'vendor', 'target', 'venv', 'Trash']);
const FAVORED_DIRS = new Set(['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos']);
const RECENT_FILE = GLib.build_filenamev([GLib.get_user_data_dir(), 'recently-used.xbel']);
const PREVIEW_ATTRS = 'standard::content-type,standard::size,standard::type,time::modified,thumbnail::path';
const ENUMERATE_BATCH = 100;
// The score of each match class: the whole name, the start of the name, the start of a word, anywhere.
const CLASS_SCORES = [95, 80, 60, 40];

class RecentFiles {
    constructor() {
        this._mtime = 0;
        this._paths = [];
    }

    async paths(cancellable) {
        let mtime;
        try {
            const info = await Gio.File.new_for_path(RECENT_FILE).query_info_async('time::modified',
                Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);
            mtime = info.get_attribute_uint64('time::modified');
        } catch {
            return this._paths;
        }
        if (mtime === this._mtime)
            return this._paths;
        const text = await readText(RECENT_FILE);
        const found = [];
        for (const m of text.matchAll(/<bookmark href="file:\/\/([^"]+)"/g)) {
            try {
                found.push(decodeURIComponent(m[1]));
            } catch {}
        }
        this._mtime = mtime;
        this._paths = found.reverse();
        return this._paths;
    }
}

async function listDir(dir) {
    const found = [];
    try {
        const it = await Gio.File.new_for_path(dir).enumerate_children_async('standard::name',
            Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
        for (;;) {
            const infos = await it.next_files_async(ENUMERATE_BATCH, GLib.PRIORITY_DEFAULT, null);
            if (infos.length === 0)
                break;
            for (const info of infos) {
                if (!info.get_name().startsWith('.'))
                    found.push(GLib.build_filenamev([dir, info.get_name()]));
            }
        }
        it.close(null);
    } catch {}
    return found;
}

// What is directly in the home folder and the favoured folders, listed again after FRESH_TTL_US.
class FreshFiles {
    constructor() {
        this._time = 0;
        this._paths = [];
        this._pending = null;
    }

    paths() {
        if (GLib.get_monotonic_time() - this._time < FRESH_TTL_US)
            return Promise.resolve(this._paths);
        this._pending ??= this._scan().finally(() => (this._pending = null));
        return this._pending;
    }

    async _scan() {
        const dirs = [HOME, ...[...FAVORED_DIRS].map(dir => GLib.build_filenamev([HOME, dir]))];
        this._paths = (await Promise.all(dirs.map(listDir))).flat();
        this._time = GLib.get_monotonic_time();
        return this._paths;
    }
}

function isNoise(path, excluded) {
    const rel = path.slice(HOME.length + 1);
    if (excluded.some(part => `/${rel}/`.includes(part)))
        return true;
    return rel.split('/').some(seg => seg.startsWith('.') || SKIP_SEGMENTS.has(seg));
}

// Returns a function that gives the match class of a lowercase file name, from 0 (best) to 3.
function nameMatcher(query) {
    const wordStart = new RegExp(`[\\s_.-]${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    return name => {
        const stem = name.replace(/\.[^.]+$/, '');
        if (name === query || stem === query)
            return 0;
        if (name.startsWith(query))
            return 1;
        return wordStart.test(name) ? 2 : 3;
    };
}

function preview(path, tildify) {
    const details = [];
    let kind = 'File';
    let image = null;
    try {
        const info = Gio.File.new_for_path(path).query_info(PREVIEW_ATTRS, Gio.FileQueryInfoFlags.NONE, null);
        const isDir = info.get_file_type() === Gio.FileType.DIRECTORY;
        kind = isDir ? 'Folder' : Gio.content_type_get_description(info.get_content_type());
        const thumb = info.get_attribute_byte_string('thumbnail::path');
        if (thumb && GLib.file_test(thumb, GLib.FileTest.EXISTS))
            image = thumb;
        if (!isDir)
            details.push(['Size', GLib.format_size(info.get_size())]);
        details.push(['Modified', GLib.DateTime.new_from_unix_local(info.get_modification_date_time().to_unix()).format('%e %b %Y, %H:%M').trim()]);
    } catch {}
    details.push(['Where', tildify(GLib.path_get_dirname(path))]);
    return {kind, image, details};
}

export default class FilesPlugin {
    constructor(api) {
        this.api = api;
        this._plocate = GLib.find_program_in_path('plocate');
        this._recent = new RecentFiles();
        this._fresh = new FreshFiles();
    }

    async _locate(terms, cancellable) {
        if (!this._plocate)
            return [];
        const proc = Gio.Subprocess.new([this._plocate, '-i', '-b', '-l', `${MAX_CANDIDATES}`, '--', ...terms],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        try {
            const [stdout] = await proc.communicate_utf8_async(null, cancellable);
            return stdout ? stdout.split('\n') : [];
        } catch (e) {
            proc.force_exit();
            throw e;
        }
    }

    async query({query, cancellable}) {
        const clean = query.split(/\s+/).map(t => t.replace(/[*?[\]\\]/g, '')).filter(Boolean);
        const words = clean.join(' ');
        if (words.length < 2)
            return [];
        const excluded = this.api.settings.get('exclude-paths');
        const classOf = nameMatcher(clean[0].toLowerCase());
        const [located, recent, fresh] = await Promise.all([
            this._locate(clean, cancellable), this._recent.paths(cancellable), this._fresh.paths(),
        ]);
        const recentRank = new Map(recent.map((p, i) => [p, i]));
        const candidates = new Set(located);
        for (const p of [...recent, ...fresh]) {
            if (matchWords(GLib.path_get_basename(p), words) !== null)
                candidates.add(p);
        }
        const scored = [];
        for (const path of candidates) {
            if (!path.startsWith(`${HOME}/`) || isNoise(path, excluded))
                continue;
            const name = GLib.path_get_basename(path).toLowerCase();
            const rel = path.slice(HOME.length + 1);
            const depth = rel.split('/').length;
            const matchClass = classOf(name);
            let rank = matchClass * 1000 + depth * 25 + name.length;
            if (recentRank.has(path))
                rank -= 900 - Math.min(recentRank.get(path), 400);
            if (depth === 1 || FAVORED_DIRS.has(rel.split('/')[0]))
                rank -= 60;
            scored.push({rank, path, score: CLASS_SCORES[matchClass]});
        }
        scored.sort((a, b) => a.rank - b.rank);
        const rows = [];
        for (const {path, score} of scored) {
            if (rows.length >= MAX_RESULTS)
                break;
            if (!GLib.file_test(path, GLib.FileTest.EXISTS))
                continue;
            const isDir = GLib.file_test(path, GLib.FileTest.IS_DIR);
            rows.push({
                id: path,
                title: GLib.path_get_basename(path),
                subtitle: this.api.tildify(GLib.path_get_dirname(path)),
                icon: size => {
                    let gicon = null;
                    try {
                        gicon = Gio.File.new_for_path(path).query_info('standard::icon', Gio.FileQueryInfoFlags.NONE, null).get_icon();
                    } catch {}
                    return new St.Icon({gicon: gicon ?? new Gio.ThemedIcon({name: 'text-x-generic'}), icon_size: size});
                },
                kind: isDir ? 'Folder' : 'File',
                score,
                path,
                bookmark: path,
                copy: path,
                activate: {open: path},
                preview: () => preview(path, this.api.tildify),
            });
        }
        return rows;
    }
}

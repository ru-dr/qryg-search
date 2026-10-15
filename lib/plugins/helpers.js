// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

export {match} from './match.js';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async');

const HTTP_TIMEOUT_S = 10;
let session = null;

function cacheFile(cacheDir, url) {
    return GLib.build_filenamev([cacheDir, `http-${GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, url, -1)}.json`]);
}

function readCache(path) {
    try {
        const file = Gio.File.new_for_path(path);
        const modified = file.query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null)
            .get_modification_date_time().to_unix();
        const [, bytes] = GLib.file_get_contents(path);
        return {age: GLib.get_real_time() / GLib.USEC_PER_SEC - modified, data: JSON.parse(new TextDecoder().decode(bytes))};
    } catch {
        return null;
    }
}

// Cancels `stop` when any of the given cancellables is cancelled. Returns a function that unlinks them.
function link(stop, cancellables) {
    const links = cancellables.filter(Boolean).map(c => [c, c.connect(() => stop.cancel())]);
    return () => links.forEach(([c, id]) => c.disconnect(id));
}

export async function fetchJson(url, {cancellable = null, ttl = 0, headers = {}, cacheDir = null, owner = null} = {}) {
    const path = ttl > 0 && cacheDir ? cacheFile(cacheDir, url) : null;
    const cached = path ? readCache(path) : null;
    if (cached && cached.age >= 0 && cached.age < ttl)
        return cached.data;
    const stop = new Gio.Cancellable();
    const unlink = link(stop, [cancellable, owner]);
    try {
        session ??= new Soup.Session({timeout: HTTP_TIMEOUT_S, user_agent: 'qryg-search'});
        const message = Soup.Message.new('GET', url);
        if (!message)
            throw new Error(`invalid URL ${url}`);
        for (const [name, value] of Object.entries(headers))
            message.get_request_headers().append(name, String(value));
        const bytes = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, stop);
        const status = message.get_status();
        if (status < 200 || status >= 300)
            throw new Error(`HTTP ${status} from ${url}`);
        const text = new TextDecoder().decode(bytes.get_data() ?? new Uint8Array());
        const data = JSON.parse(text);
        if (path)
            GLib.file_set_contents(path, text);
        return data;
    } catch (e) {
        // Offline or a bad reply: an old copy is better than nothing, unless the caller gave up.
        if (cached && !stop.is_cancelled())
            return cached.data;
        throw e;
    } finally {
        unlink();
    }
}

Gio._promisify(Gio.File.prototype, 'load_contents_async');

// The text of a file, or '' when it can't be read.
export async function readText(path, cancellable = null) {
    try {
        const [bytes] = await Gio.File.new_for_path(path).load_contents_async(cancellable);
        return new TextDecoder().decode(bytes);
    } catch {
        return '';
    }
}

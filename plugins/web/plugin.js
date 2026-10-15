// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import {URL_LIKE} from '../../lib/core/bookmarks.js';
import {toUrl} from '../../lib/plugins/url.js';

export default class WebPlugin {
    constructor(api) {
        this.api = api;
    }

    _search(name, url, q) {
        const target = url.replace('%s', GLib.uri_escape_string(q, null, false));
        return {
            id: name, title: q, subtitle: `Search ${name}`, icon: 'system-search-symbolic',
            copy: target, activate: {open: target}, preview: {kind: `Search ${name}`, details: [['URL', target]]},
        };
    }

    query({query, forced}) {
        if (!query)
            return [];
        const rows = [];
        if (URL_LIKE.test(query)) {
            const url = toUrl(query);
            rows.push({id: 'url', title: url, subtitle: 'Open in browser', icon: 'web-browser-symbolic', copy: url, bookmark: url, activate: {open: url}, preview: {kind: 'Website', details: [['URL', url]]}});
        }
        const [first, ...rest] = query.split(/\s+/);
        for (const line of this.api.settings.get('shortcuts')) {
            const [key, name, url] = line.split('|');
            if (key && name && url && key.toLowerCase() === first.toLowerCase() && rest.length > 0) {
                rows.push(this._search(name, url, rest.join(' ')));
                break;
            }
        }
        if (forced || this.api.settings.get('fallback')) {
            const engine = this.api.settings.get('engine');
            if (engine.includes('%s')) {
                let host = 'the web';
                try {
                    host = GLib.Uri.parse(engine.replace('%s', 'x'), GLib.UriFlags.NONE).get_host()?.replace(/^www\./, '') || host;
                } catch {}
                rows.push(this._search(host, engine, query));
            }
        }
        return rows;
    }
}

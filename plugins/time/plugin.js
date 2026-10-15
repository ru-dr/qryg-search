// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import * as Z from './zones.js';
import {readText} from '../../lib/plugins/helpers.js';
import {copyRow} from '../../lib/plugins/rows.js';
import {relativeTime} from '../../lib/plugins/text.js';

const ICON = 'x-office-calendar-symbolic';
const ZONE_ICON = 'preferences-system-time-symbolic';

// `nowMs` is given when the time is now: then the last row is Unix milliseconds instead of the time relative to now.
function timestampRows(unixSeconds, nowMs = null) {
    const seconds = Math.floor(unixSeconds);
    const dt = GLib.DateTime.new_from_unix_local(seconds);
    const list = [
        [dt.format('%a %e %b %Y, %H:%M:%S %Z').replace(/\s+/g, ' '), 'Local time'],
        [dt.to_utc().format('%Y-%m-%dT%H:%M:%SZ'), 'ISO 8601 UTC'],
        [`${seconds}`, 'Unix seconds'],
        nowMs !== null
            ? [`${nowMs}`, 'Unix milliseconds']
            : [relativeTime(seconds - Math.floor(Date.now() / 1000)), 'Relative to now'],
    ];
    const details = list.map(([v, k]) => [k, v]);
    return list.map(([title, subtitle]) => copyRow(title, subtitle, ICON, {preview: {kind: subtitle, details}}));
}

function offsetMinutes(dt) {
    return Math.round(dt.get_utc_offset() / 60e6);
}

export default class TimePlugin {
    constructor(api) {
        this.api = api;
        this._index = null;
    }

    _loadIndex() {
        this._index ??= (async () => {
            const dir = GLib.getenv('TZDIR') || '/usr/share/zoneinfo';
            const path = name => GLib.build_filenamev([dir, name]);
            const [zoneTab, zone1970, countries, tzdata] = await Promise.all(
                ['zone.tab', 'zone1970.tab', 'iso3166.tab', 'tzdata.zi'].map(name => readText(path(name))));
            return Z.buildIndex({
                zones: Z.parseZoneTab(zoneTab || zone1970),
                countries: Z.parseCountries(countries),
                links: Z.parseLinks(tzdata),
            });
        })();
        return this._index;
    }

    _zoneRow(tz, label, id, score) {
        if (!tz)
            return null;
        const dt = GLib.DateTime.new_now(tz);
        const offset = offsetMinutes(dt);
        const here = offsetMinutes(GLib.DateTime.new_now_local());
        const time = dt.format('%H:%M');
        const date = dt.format('%a %e %b').replace(/\s+/g, ' ');
        const diff = Z.difference(offset, here);
        const details = [
            ['Time', dt.format('%H:%M:%S')],
            ['Date', dt.format('%A %e %B %Y').replace(/\s+/g, ' ')],
            ['UTC offset', Z.formatOffset(offset)],
            ['Compared to here', diff],
            ['ISO 8601', dt.format('%Y-%m-%dT%H:%M:%S%:z')],
        ];
        if (id)
            details.push(['Time zone', id]);
        return copyRow(`${time} in ${label}`, [date, Z.formatOffset(offset), diff].join(' · '), ZONE_ICON, {
            id: id ?? Z.formatOffset(offset),
            kind: 'World clock',
            score,
            actions: [{id: 'iso', label: 'Copy ISO 8601', icon: 'edit-copy-symbolic', copy: dt.format('%Y-%m-%dT%H:%M:%S%:z')}],
            preview: {title: time, kind: label, details},
        });
    }

    _idRow(index, id, score) {
        let tz = null;
        try {
            tz = GLib.TimeZone.new_identifier(id);
        } catch {}
        const meta = index.meta.get(id);
        const city = meta?.city ?? Z.cityOf(id);
        const label = meta?.country && meta.country !== city ? `${city}, ${meta.country}` : city;
        return this._zoneRow(tz, label, id, score);
    }

    _offsetRow(minutes, score) {
        const tz = GLib.TimeZone.new_offset(minutes * 60);
        return this._zoneRow(tz, Z.formatOffset(minutes), null, score);
    }

    async _world(place) {
        const offset = Z.parseOffset(place);
        if (offset !== null && offset !== 0)
            return [this._offsetRow(offset, 90)];
        const index = await this._loadIndex();
        if (offset === 0)
            return [this._idRow(index, 'UTC', 90)].filter(Boolean);
        return Z.lookup(index, place).map(({id, score}) => this._idRow(index, id, score)).filter(Boolean);
    }

    async _clocks() {
        const clocks = this.api.settings.get('clocks');
        if (clocks.length === 0)
            return [];
        const index = await this._loadIndex();
        return clocks.flatMap(place => {
            const offset = Z.parseOffset(place);
            if (offset !== null)
                return [this._offsetRow(offset)];
            const [best] = Z.lookup(index, place);
            return best ? [this._idRow(index, best.id)] : [];
        }).filter(Boolean);
    }

    async query({query, forced}) {
        const low = query.toLowerCase();
        if (/^(now|time|date|unix|epoch|timestamp)$/.test(low) || (forced && !low)) {
            const now = Date.now();
            return [...timestampRows(now / 1000, now), ...await this._clocks()];
        }
        const m = /^(?:ts\s+)?(\d{10}|\d{13})$/.exec(low);
        if (m)
            return timestampRows(m[1].length === 13 ? Number(m[1]) / 1000 : Number(m[1]));
        const place = Z.parsePlace(query) ?? (forced ? query.replace(/^(?:in|at)\s+/i, '').trim() || null : null);
        return place ? this._world(place) : [];
    }
}

// SPDX-License-Identifier: GPL-3.0-or-later
// World clock lookups and relative times. No GNOME imports, so it can be tested with node.

// Names people type that are not in the zone database, and abbreviations, which it does not resolve well.
export const ALIASES = {
    'utc': 'UTC', 'gmt': 'UTC', 'z': 'UTC', 'zulu': 'UTC', 'universal': 'UTC',
    'pst': 'America/Los_Angeles', 'pdt': 'America/Los_Angeles', 'pt': 'America/Los_Angeles', 'pacific': 'America/Los_Angeles',
    'mst': 'America/Denver', 'mdt': 'America/Denver', 'mountain': 'America/Denver',
    'cst': 'America/Chicago', 'cdt': 'America/Chicago', 'central': 'America/Chicago',
    'est': 'America/New_York', 'edt': 'America/New_York', 'et': 'America/New_York', 'eastern': 'America/New_York',
    'akst': 'America/Anchorage', 'hst': 'Pacific/Honolulu',
    'bst': 'Europe/London', 'wet': 'Europe/Lisbon', 'cet': 'Europe/Paris', 'cest': 'Europe/Paris',
    'eet': 'Europe/Athens', 'eest': 'Europe/Athens', 'msk': 'Europe/Moscow',
    'ist': 'Asia/Kolkata', 'pkt': 'Asia/Karachi', 'sgt': 'Asia/Singapore', 'hkt': 'Asia/Hong_Kong',
    'jst': 'Asia/Tokyo', 'kst': 'Asia/Seoul', 'aest': 'Australia/Sydney', 'aedt': 'Australia/Sydney',
    'acst': 'Australia/Adelaide', 'awst': 'Australia/Perth', 'nzst': 'Pacific/Auckland', 'nzdt': 'Pacific/Auckland',
    'nyc': 'America/New_York', 'new york city': 'America/New_York', 'washington': 'America/New_York',
    'washington dc': 'America/New_York', 'boston': 'America/New_York', 'philadelphia': 'America/New_York',
    'atlanta': 'America/New_York', 'miami': 'America/New_York', 'montreal': 'America/Toronto', 'ottawa': 'America/Toronto',
    'dallas': 'America/Chicago', 'houston': 'America/Chicago', 'austin': 'America/Chicago',
    'la': 'America/Los_Angeles', 'sf': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles',
    'seattle': 'America/Los_Angeles', 'portland': 'America/Los_Angeles', 'san diego': 'America/Los_Angeles',
    'las vegas': 'America/Los_Angeles', 'silicon valley': 'America/Los_Angeles', 'salt lake city': 'America/Denver',
    'rio': 'America/Sao_Paulo', 'rio de janeiro': 'America/Sao_Paulo',
    'manchester': 'Europe/London', 'edinburgh': 'Europe/London', 'munich': 'Europe/Berlin', 'frankfurt': 'Europe/Berlin',
    'hamburg': 'Europe/Berlin', 'barcelona': 'Europe/Madrid', 'milan': 'Europe/Rome', 'geneva': 'Europe/Zurich',
    'krakow': 'Europe/Warsaw', 'st petersburg': 'Europe/Moscow', 'saint petersburg': 'Europe/Moscow',
    'beijing': 'Asia/Shanghai', 'shenzhen': 'Asia/Shanghai', 'guangzhou': 'Asia/Shanghai',
    'mumbai': 'Asia/Kolkata', 'bombay': 'Asia/Kolkata', 'delhi': 'Asia/Kolkata', 'new delhi': 'Asia/Kolkata',
    'bangalore': 'Asia/Kolkata', 'bengaluru': 'Asia/Kolkata', 'chennai': 'Asia/Kolkata', 'hyderabad': 'Asia/Kolkata',
    'pune': 'Asia/Kolkata', 'abu dhabi': 'Asia/Dubai', 'osaka': 'Asia/Tokyo', 'kyoto': 'Asia/Tokyo',
    'hanoi': 'Asia/Bangkok', 'ho chi minh city': 'Asia/Ho_Chi_Minh', 'saigon': 'Asia/Ho_Chi_Minh',
    'cape town': 'Africa/Johannesburg', 'canberra': 'Australia/Sydney', 'wellington': 'Pacific/Auckland',
};

// Used when the zone database files are missing.
export const FALLBACK_ZONES = [
    'UTC', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi', 'America/Anchorage',
    'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Chicago', 'America/Denver', 'America/Halifax',
    'America/Lima', 'America/Los_Angeles', 'America/Mexico_City', 'America/New_York', 'America/Phoenix',
    'America/Santiago', 'America/Sao_Paulo', 'America/St_Johns', 'America/Toronto', 'America/Vancouver',
    'Asia/Bangkok', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Jakarta', 'Asia/Jerusalem', 'Asia/Karachi',
    'Asia/Kathmandu', 'Asia/Kolkata', 'Asia/Manila', 'Asia/Riyadh', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore',
    'Asia/Taipei', 'Asia/Tehran', 'Asia/Tokyo', 'Atlantic/Reykjavik', 'Australia/Adelaide', 'Australia/Brisbane',
    'Australia/Melbourne', 'Australia/Perth', 'Australia/Sydney', 'Europe/Amsterdam', 'Europe/Athens', 'Europe/Berlin',
    'Europe/Brussels', 'Europe/Dublin', 'Europe/Helsinki', 'Europe/Istanbul', 'Europe/Kyiv', 'Europe/Lisbon',
    'Europe/London', 'Europe/Madrid', 'Europe/Moscow', 'Europe/Paris', 'Europe/Prague', 'Europe/Rome',
    'Europe/Stockholm', 'Europe/Vienna', 'Europe/Warsaw', 'Europe/Zurich', 'Pacific/Auckland', 'Pacific/Honolulu',
];

const TRIGGER = '(?:time|now|date|clock)';
const MAX_MATCHES = 6;

export function normalize(text) {
    return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
        .replace(/[_./-]+/g, ' ').replace(/[^\p{L}\p{N}+:' ]/gu, '').replace(/\s+/g, ' ').trim();
}

export function cityOf(id) {
    return id.split('/').pop().replace(/_/g, ' ');
}

function rows(text) {
    return text.split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split('\t'));
}

// zone.tab or zone1970.tab: country codes, coordinates, zone id, comment.
export function parseZoneTab(text) {
    return rows(text).filter(cols => cols.length >= 3)
        .map(([codes, , id]) => ({id, countries: codes.split(',')}));
}

// iso3166.tab: code and country name.
export function parseCountries(text) {
    return Object.fromEntries(rows(text).filter(cols => cols.length >= 2).map(([code, name]) => [code, name]));
}

// The "L target alias" lines of tzdata.zi.
export function parseLinks(text) {
    return text.split('\n').filter(line => line.startsWith('L ')).map(line => {
        const [, target, alias] = line.trim().split(/\s+/);
        return {target, alias};
    }).filter(link => link.target && link.alias);
}

export function buildIndex({zones = [], countries = {}, links = []} = {}) {
    const names = new Map();
    const meta = new Map();
    const add = (key, id) => {
        key = normalize(key);
        if (!key)
            return;
        const list = names.get(key) ?? [];
        if (!list.includes(id))
            list.push(id);
        names.set(key, list);
    };
    const list = zones.length > 0 ? zones : FALLBACK_ZONES.map(id => ({id, countries: []}));
    for (const {id, countries: codes} of list) {
        const country = codes.length === 1 ? countries[codes[0]] : undefined;
        meta.set(id, {city: cityOf(id), country});
        add(cityOf(id), id);
        add(id, id);
    }
    for (const {id, countries: codes} of list) {
        for (const code of codes) {
            if (countries[code])
                add(countries[code], id);
        }
    }
    for (const {target, alias} of links) {
        if (/^[A-Z0-9+-]+$/.test(alias) || alias.startsWith('Etc/') || !meta.has(target))
            continue;
        if (!names.has(normalize(cityOf(alias))))
            add(cityOf(alias), target);
    }
    for (const [key, id] of Object.entries(ALIASES)) {
        names.set(key, [id]);
        if (!meta.has(id))
            meta.set(id, {city: id === 'UTC' ? 'UTC' : cityOf(id)});
    }
    return {names, meta};
}

// "+5:30", "utc+2", "gmt -0800", "UTC" → minutes east of UTC, or null.
export function parseOffset(text) {
    const t = text.toLowerCase().replace(/\s+/g, '');
    if (/^(?:utc|gmt|z)$/.test(t))
        return 0;
    const m = /^(?:utc|gmt)?([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(t);
    if (!m)
        return null;
    const hours = Number(m[2]);
    const minutes = Number(m[3] ?? 0);
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes > 0))
        return null;
    return (m[1] === '-' ? -1 : 1) * (hours * 60 + minutes);
}

// Returns the place part of a world clock query, or null when the query is not one.
export function parsePlace(query) {
    const q = query.trim().replace(/\s+/g, ' ');
    let m = new RegExp(`^${TRIGGER} (?:in|at) (.+)$`, 'i').exec(q) ??
        new RegExp(`^${TRIGGER} (.+)$`, 'i').exec(q) ??
        new RegExp(`^(.+?) ${TRIGGER}$`, 'i').exec(q);
    if (m)
        return m[1].replace(/\?$/, '').trim() || null;
    m = /^(?:utc|gmt) ?[+-] ?\d{1,2}(?::?\d{2})?$/i.exec(q);
    return m ? q : null;
}

// Zone ids for a place, best first, with a score from 0 to 100.
export function lookup(index, place) {
    const key = normalize(place);
    if (key.length < 2)
        return [];
    const exact = index.names.get(key);
    if (exact)
        return exact.slice(0, MAX_MATCHES).map(id => ({id, score: 90}));
    if (key.length < 3)
        return [];
    const found = [];
    for (const [name, ids] of index.names) {
        if (!name.startsWith(key) && !name.includes(` ${key}`))
            continue;
        for (const id of ids) {
            if (!found.some(f => f.id === id))
                found.push({id, score: name.startsWith(key) ? 60 : 45, name});
        }
    }
    found.sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.id.localeCompare(b.id));
    return found.slice(0, MAX_MATCHES).map(({id, score}) => ({id, score}));
}

export function formatOffset(minutes) {
    const sign = minutes < 0 ? '-' : '+';
    const abs = Math.abs(minutes);
    return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// The difference between a zone and the local one, both in minutes east of UTC.
export function difference(zoneMinutes, localMinutes) {
    const diff = zoneMinutes - localMinutes;
    if (diff === 0)
        return 'Same time as here';
    const abs = Math.abs(diff);
    const h = Math.floor(abs / 60);
    const min = abs % 60;
    const amount = [h ? `${h} h` : '', min ? `${min} min` : ''].filter(Boolean).join(' ');
    return `${amount} ${diff > 0 ? 'ahead' : 'behind'}`;
}

const UNITS = [
    ['year', 365 * 86400], ['month', 30 * 86400], ['week', 7 * 86400], ['day', 86400],
    ['hour', 3600], ['minute', 60], ['second', 1],
];

// seconds is the time minus now: negative is in the past.
export function relative(seconds) {
    const abs = Math.abs(seconds);
    if (abs < 10)
        return 'Just now';
    const [unit, size] = UNITS.find(([, s]) => abs >= s);
    const n = Math.floor(abs / size);
    const text = `${n} ${unit}${n === 1 ? '' : 's'}`;
    return seconds < 0 ? `${text} ago` : `in ${text}`;
}

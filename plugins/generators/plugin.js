// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {copyRow, warningRow} from '../../lib/plugins/rows.js';

const HASHES = {
    md5: GLib.ChecksumType.MD5, sha1: GLib.ChecksumType.SHA1, sha256: GLib.ChecksumType.SHA256,
    sha384: GLib.ChecksumType.SHA384, sha512: GLib.ChecksumType.SHA512,
};
// The characters a generated password is made of, without look-alikes such as 0, O, 1 and l.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+';
// GLib.random_int_range takes 32-bit integers and leaves out its end, so the highest number is one less than the int32 maximum.
const RANDOM_MIN = -2147483647;
const RANDOM_MAX = 2147483646;
const KEY_ICON = 'dialog-password-symbolic';
const TEXT_ICON = 'text-x-generic-symbolic';
const WEB_ICON = 'web-browser-symbolic';

function randomBytes(n) {
    const stream = Gio.File.new_for_path('/dev/urandom').read(null);
    try {
        return stream.read_bytes(n, null).toArray();
    } finally {
        stream.close(null);
    }
}

// Bytes from the kernel's random source. Bytes that would favour the first characters are thrown away.
function randomPassword(len) {
    const limit = 256 - 256 % ALPHABET.length;
    let out = '';
    while (out.length < len) {
        for (const byte of randomBytes(len * 2)) {
            if (byte < limit && out.length < len)
                out += ALPHABET[byte % ALPHABET.length];
        }
    }
    return out;
}

function row(title, subtitle, icon) {
    return copyRow(title, subtitle, icon, {preview: {kind: subtitle, code: title}});
}

function uuid() {
    const u = GLib.uuid_string_random();
    return [row(u, 'UUID v4', KEY_ICON), row(u.toUpperCase(), 'UUID v4, uppercase', KEY_ICON)];
}

function hash([, name, text]) {
    return [row(GLib.compute_checksum_for_string(HASHES[name.toLowerCase()], text, -1), `${name.toUpperCase()} of "${text}"`, KEY_ICON)];
}

function base64Decode([, , text]) {
    try {
        const decoded = new TextDecoder('utf-8', {fatal: true}).decode(GLib.base64_decode(text.trim()));
        return decoded ? [row(decoded, 'Base64 decoded', TEXT_ICON)] : [];
    } catch {
        return [warningRow('Not valid Base64', text)];
    }
}

function randomNumber([, first, second]) {
    const clamp = n => Math.max(RANDOM_MIN, Math.min(RANDOM_MAX, n));
    const lo = clamp(second !== undefined ? Number(first) : 1);
    const hi = clamp(second !== undefined ? Number(second) : first !== undefined ? Number(first) : 100);
    const [a, b] = [Math.min(lo, hi), Math.max(lo, hi)];
    return [row(`${GLib.random_int_range(a, b + 1)}`, `Random number ${a} to ${b}`, 'media-playlist-shuffle-symbolic')];
}

function password([, length]) {
    const len = Math.min(128, Math.max(4, Number(length ?? 20)));
    return [row(randomPassword(len), `Random password, ${len} characters`, KEY_ICON)];
}

// Tried in order. The first pattern that matches the query makes the rows.
const GENERATORS = [
    {pattern: /^(uuid|guid)$/i, handler: uuid},
    {pattern: /^(md5|sha1|sha256|sha384|sha512)\s+(.+)$/is, handler: hash},
    {pattern: /^(base64d|b64d|unbase64|base64 -d)\s+(.+)$/is, handler: base64Decode},
    {pattern: /^(base64|b64)\s+(.+)$/is, handler: ([, , text]) => [row(GLib.base64_encode(new TextEncoder().encode(text)), 'Base64 encoded', TEXT_ICON)]},
    {pattern: /^(urldecode|unurl)\s+(.+)$/is, handler: ([, , text]) => [row(GLib.uri_unescape_string(text, null) ?? text, 'URL decoded', WEB_ICON)]},
    {pattern: /^(url|urlencode)\s+(.+)$/is, handler: ([, , text]) => [row(GLib.uri_escape_string(text, null, false), 'URL encoded', WEB_ICON)]},
    {pattern: /^(?:random|rand)(?:\s+(-?\d+)(?:\s+(-?\d+))?)?$/i, handler: randomNumber},
    {pattern: /^(?:password|pwgen|pass)(?:\s+(\d+))?$/i, handler: password},
];

export default class GeneratorsPlugin {
    constructor(api) {
        this.api = api;
    }

    query({query}) {
        for (const {pattern, handler} of GENERATORS) {
            const m = pattern.exec(query);
            if (m)
                return handler(m);
        }
        return [];
    }
}

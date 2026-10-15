// SPDX-License-Identifier: GPL-3.0-or-later

// The digits of a hex color, without the "#".
export const HEX_DIGITS = /^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
}

function fromHex(h) {
    if (h.length === 3 || h.length === 4)
        h = [...h].map(c => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return {r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1};
}

function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const f = n => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export function parseColor(input) {
    const q = input.trim().toLowerCase();
    let m;
    if (q.startsWith('#') && HEX_DIGITS.test(q.slice(1)))
        return fromHex(q.slice(1));
    if ((m = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(q))) {
        const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        return {r: clamp(+m[1], 0, 255), g: clamp(+m[2], 0, 255), b: clamp(+m[3], 0, 255), a: clamp(a, 0, 1)};
    }
    if ((m = /^hsla?\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(q))) {
        const [r, g, b] = hslToRgb(+m[1] % 360, clamp(+m[2], 0, 100), clamp(+m[3], 0, 100));
        const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        return {r, g, b, a: clamp(a, 0, 1)};
    }
    return null;
}

function hex2(n) {
    return n.toString(16).padStart(2, '0');
}

export function toHex({r, g, b, a}) {
    return `#${hex2(r)}${hex2(g)}${hex2(b)}${a < 1 ? hex2(Math.round(a * 255)) : ''}`.toUpperCase();
}

export function toHsl({r, g, b}) {
    const [R, G, B] = [r / 255, g / 255, b / 255];
    const max = Math.max(R, G, B), min = Math.min(R, G, B);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
        h *= 60;
    }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

export function toHsv({r, g, b}) {
    const [R, G, B] = [r / 255, g / 255, b / 255];
    const max = Math.max(R, G, B), min = Math.min(R, G, B);
    const d = max - min;
    let h = 0;
    if (d) {
        h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
        h *= 60;
    }
    return [Math.round(h), Math.round(max ? d / max * 100 : 0), Math.round(max * 100)];
}

export function toCmyk({r, g, b}) {
    const [R, G, B] = [r / 255, g / 255, b / 255];
    const k = 1 - Math.max(R, G, B);
    if (k === 1)
        return [0, 0, 0, 100];
    return [(1 - R - k) / (1 - k), (1 - G - k) / (1 - k), (1 - B - k) / (1 - k), k].map(v => Math.round(v * 100));
}

export function luminance({r, g, b}) {
    const lin = c => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(c1, c2) {
    const [a, b] = [luminance(c1), luminance(c2)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
}

export function spectrum(c, step = 14) {
    const [h, s, l] = toHsl(c);
    return [-2, -1, 0, 1, 2].map(i => {
        const [r, g, b] = hslToRgb(h, s, clamp(l + i * step, 0, 100));
        return i === 0 ? {...c, a: 1} : {r, g, b, a: 1};
    });
}

export function colorFormats(c) {
    const [h, s, l] = toHsl(c);
    const [hh, sv, v] = toHsv(c);
    const [cc, mm, yy, kk] = toCmyk(c);
    const alpha = c.a < 1 ? Number(c.a.toFixed(2)) : null;
    return [
        ['HEX', toHex(c)],
        ['RGB', alpha === null ? `rgb(${c.r}, ${c.g}, ${c.b})` : `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`],
        ['HSL', alpha === null ? `hsl(${h}, ${s}%, ${l}%)` : `hsla(${h}, ${s}%, ${l}%, ${alpha})`],
        ['HSV', `hsv(${hh}, ${sv}%, ${v}%)`],
        ['CMYK', `cmyk(${cc}%, ${mm}%, ${yy}%, ${kk}%)`],
    ];
}

// SPDX-License-Identifier: GPL-3.0-or-later
// No GNOME imports, so it can be tested with node.
import {FUNCTION_NAMES, evaluate} from '../../lib/plugins/math.js';

const PLAIN_NUMBER = /^[\d.,_\s]+$/;
const FUNCTION_CALL = new RegExp(`\\b[a-z][a-z0-9]*\\s*\\(|\\b(?:${FUNCTION_NAMES.join('|')})\\s+[\\d.(a-zπ]`, 'i');

export function canCalculate(src) {
    const text = src.trim();
    if (!text || PLAIN_NUMBER.test(text) || /^\d{4}-\d{2}-\d{2}/.test(text))
        return false;
    if (!/\d/.test(text) && !FUNCTION_CALL.test(text))
        return false;
    try {
        return Number.isFinite(evaluate(text).value) || /\/\s*0/.test(text);
    } catch {
        return false;
    }
}

export function toBase(x, base) {
    const n = BigInt(Math.trunc(x));
    const neg = n < 0n;
    const abs = neg ? -n : n;
    const prefix = {16: '0x', 2: '0b', 8: '0o', 10: ''}[base];
    let digits = abs.toString(base);
    if (base === 16)
        digits = digits.toUpperCase();
    if (base === 2)
        digits = digits.padStart(Math.ceil(digits.length / 4) * 4, '0');
    const sign = neg ? '-' : '';
    const grouped = base === 2 ? digits.replace(/(.{4})(?=.)/g, '$1 ') : digits;
    return {text: `${sign}${prefix}${grouped}`, copy: `${sign}${prefix}${digits}`};
}

export const BASE_CONVERSION = /^\s*(.+?)\s+(?:to|in|as)\s+(hex|hexadecimal|bin|binary|oct|octal|dec|decimal)\s*$/i;

export function baseOf(name) {
    return {hex: 16, hexadecimal: 16, bin: 2, binary: 2, oct: 8, octal: 8, dec: 10, decimal: 10}[name.toLowerCase()];
}

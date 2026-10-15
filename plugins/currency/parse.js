// SPDX-License-Identifier: GPL-3.0-or-later
// No GNOME imports, so it can be tested with node.

export const SYMBOLS = {'$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR'};
const ISO_CODES = new Set(Intl.supportedValuesOf('currency'));
const SYMBOL = '[$€£¥₹]';
const CODE = `[a-zA-Z]{3}|${SYMBOL}`;
const TO = '\\s+(?:to|in|as|into|=|->)\\s+';
// Each pattern captures [amount, from, to] in some order, given by its keys.
const PATTERNS = [
    [new RegExp(`^\\s*(${SYMBOL})\\s*(.+?)${TO}(${CODE})\\s*$`), ['from', 'amount', 'to']],
    [new RegExp(`^\\s*(.+?)\\s*(${CODE})${TO}(${CODE})\\s*$`), ['amount', 'from', 'to']],
    [new RegExp(`^\\s*(${SYMBOL})\\s*(.+?)\\s*$`), ['from', 'amount']],
    [new RegExp(`^\\s*(.+?)\\s*(${CODE})\\s*$`), ['amount', 'from']],
];

export function currencyCode(name) {
    const code = SYMBOLS[name] ?? name.toUpperCase();
    return ISO_CODES.has(code) ? code : null;
}

// "50 usd to inr", "$50 to eur", "100 eur", "€20" → {amount, from, to}, with `to` null when not given, or null.
export function parseQuery(query) {
    for (const [pattern, keys] of PATTERNS) {
        const m = pattern.exec(query);
        if (!m)
            continue;
        const parts = Object.fromEntries(keys.map((key, i) => [key, m[i + 1]]));
        const from = currencyCode(parts.from);
        const to = parts.to === undefined ? null : currencyCode(parts.to);
        return from && (parts.to === undefined || to) ? {amount: parts.amount, from, to} : null;
    }
    return null;
}

export function currencyDigits(code) {
    try {
        return new Intl.NumberFormat('en-US', {style: 'currency', currency: code}).resolvedOptions().maximumFractionDigits;
    } catch {
        return 2;
    }
}

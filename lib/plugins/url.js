// SPDX-License-Identifier: GPL-3.0-or-later
// No GNOME imports, so it can be tested with node.

// "example.com/x" → "https://example.com/x". Local servers get http, and a URL with a scheme is kept.
export function toUrl(text) {
    if (/^https?:\/\//i.test(text))
        return text;
    return `${/^localhost(?=[:/]|$)/i.test(text) ? 'http' : 'https'}://${text}`;
}

// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import * as E from '../calc/engine.js';

const RATES_URL = 'https://open.er-api.com/v6/latest/USD';
const RATES_MAX_AGE_S = 12 * 3600;
const CHECK_EVERY_MS = 10 * 60 * 1000;
const SYMBOLS = {'$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR'};
const PAIR = /^\s*(.+?)\s*([a-zA-Z$€£¥₹]{1,3})\s+(?:to|in|as|into|=|->)\s+([a-zA-Z$€£¥₹]{1,3})\s*$/;
const SINGLE = /^\s*(.+?)\s*([a-zA-Z$€£¥₹]{1,3})\s*$/;

class Rates {
    constructor(api) {
        this._api = api;
        this._rates = null;
        this._time = 0;
        this._pending = null;
        this._checkedAt = 0;
    }

    get updated() {
        return this._time;
    }

    async get() {
        if (Date.now() - this._checkedAt > CHECK_EVERY_MS)
            await (this._pending ??= this._fetch().finally(() => (this._pending = null)));
        return this._rates;
    }

    async _fetch() {
        try {
            const data = await this._api.fetchJson(RATES_URL, {ttl: RATES_MAX_AGE_S});
            if (data?.result === 'success' && data.rates) {
                this._rates = data.rates;
                this._time = data.time_last_update_unix ?? Math.floor(Date.now() / 1000);
            }
        } catch {}
        this._checkedAt = Date.now();
    }
}

function code(name, rates) {
    const c = SYMBOLS[name] ?? name.toUpperCase();
    return rates && c in rates ? c : null;
}

function looksLikeCurrency(name) {
    return Boolean(SYMBOLS[name]) || /^[a-zA-Z]{3}$/.test(name);
}

export default class CurrencyPlugin {
    constructor(api) {
        this.api = api;
        this._rates = new Rates(api);
    }

    async query({query, cancellable}) {
        const m = PAIR.exec(query) ?? SINGLE.exec(query);
        if (!m || !looksLikeCurrency(m[2]) || (m[3] && !looksLikeCurrency(m[3])))
            return [];
        let amount;
        try {
            amount = E.evaluate(m[1]).value;
        } catch {
            return [];
        }
        const hadRates = this._rates.updated > 0;
        const rates = await this._rates.get();
        if (cancellable?.is_cancelled()) {
            if (rates && !hadRates)
                this.api.refresh();
            return [];
        }
        if (!rates)
            return [];
        const src = code(m[2], rates);
        const dests = m[3]
            ? [code(m[3], rates)]
            : this.api.settings.get('currencies').map(c => code(c, rates)).filter(c => c && c !== src);
        if (!src || dests.length === 0 || dests.some(d => !d))
            return [];
        const when = GLib.DateTime.new_from_unix_local(this._rates.updated).format('%e %b').trim();
        return dests.map(dest => {
            const value = amount / rates[src] * rates[dest];
            const text = value.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            const copy = value.toFixed(2);
            return {
                title: `${text} ${dest}`,
                subtitle: `${E.formatGrouped(amount, 2)} ${src} · rate ${(rates[dest] / rates[src]).toPrecision(6)} · ${when}`,
                icon: 'accessories-calculator-symbolic',
                copy,
                activate: {copy},
                preview: {
                    kind: 'Currency',
                    details: [['From', `${E.formatGrouped(amount, 2)} ${src}`], ['To', `${text} ${dest}`],
                        ['Rate', (rates[dest] / rates[src]).toPrecision(6)], ['Rates from', when]],
                },
            };
        });
    }
}

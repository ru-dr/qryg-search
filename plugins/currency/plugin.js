// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import {evaluate, formatGrouped} from '../../lib/plugins/math.js';
import {copyRow} from '../../lib/plugins/rows.js';
import {currencyCode, currencyDigits, parseQuery} from './parse.js';

const RATES_URL = 'https://open.er-api.com/v6/latest/USD';
const RATES_MAX_AGE_S = 12 * 3600;
const CHECK_EVERY_MS = 10 * 60 * 1000;

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

export default class CurrencyPlugin {
    constructor(api) {
        this.api = api;
        this._rates = new Rates(api);
    }

    async query({query, cancellable}) {
        const parsed = parseQuery(query);
        if (!parsed)
            return [];
        let amount;
        try {
            amount = evaluate(parsed.amount).value;
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
        const src = parsed.from;
        const known = code => Boolean(code) && code in rates;
        const dests = parsed.to
            ? [parsed.to]
            : this.api.settings.get('currencies').map(currencyCode).filter(c => known(c) && c !== src);
        if (!known(src) || dests.length === 0 || !dests.every(known))
            return [];
        const when = GLib.DateTime.new_from_unix_local(this._rates.updated).format('%e %b').trim();
        const from = `${formatGrouped(amount, 2)} ${src}`;
        return dests.map(dest => {
            const rate = (rates[dest] / rates[src]).toPrecision(6);
            const digits = currencyDigits(dest);
            const value = amount / rates[src] * rates[dest];
            const to = `${value.toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits})} ${dest}`;
            return copyRow(to, `${from} · rate ${rate} · ${when}`, 'accessories-calculator-symbolic', {
                copy: value.toFixed(digits),
                preview: {kind: 'Currency', details: [['From', from], ['To', to], ['Rate', rate], ['Rates from', when]]},
            });
        });
    }
}

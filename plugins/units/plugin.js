// SPDX-License-Identifier: GPL-3.0-or-later
import * as U from './units.js';
import {evaluate, formatGrouped, formatNumber} from '../../lib/plugins/math.js';
import {copyRow} from '../../lib/plugins/rows.js';
import {capitalize} from '../../lib/plugins/text.js';

export default class UnitsPlugin {
    constructor(api) {
        this.api = api;
    }

    query({query}) {
        const m = U.CONVERSION.exec(query);
        if (!m)
            return [];
        let amount;
        try {
            amount = evaluate(m[1]).value;
        } catch {
            return [];
        }
        const unit = U.convertUnits(amount, m[2], m[3]);
        if (!unit)
            return [];
        const text = formatGrouped(unit.value, 6);
        const subtitle = `${formatGrouped(amount, 6)} ${unit.from} = ${text} ${unit.to} · ${unit.category}`;
        return [copyRow(`${text} ${unit.to}`, subtitle, 'accessories-calculator-symbolic', {
            copy: formatNumber(Number(unit.value.toPrecision(12))),
            preview: {kind: capitalize(unit.category), body: subtitle},
        })];
    }
}

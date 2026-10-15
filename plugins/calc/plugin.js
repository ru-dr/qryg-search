// SPDX-License-Identifier: GPL-3.0-or-later
import * as E from './engine.js';
import {evaluate, formatNumber} from '../../lib/plugins/math.js';
import {copyRow, warningRow} from '../../lib/plugins/rows.js';

const ICON = 'accessories-calculator-symbolic';
const DEV_ICON = 'utilities-terminal-symbolic';

function row(title, subtitle, copy, icon = ICON) {
    return copyRow(title, subtitle, icon, {copy, preview: {kind: subtitle, body: 'Enter copies the result'}});
}

export default class CalculatorPlugin {
    constructor(api) {
        this.api = api;
    }

    query({query, forced}) {
        if (!query)
            return [];
        const base = E.BASE_CONVERSION.exec(query);
        if (base) {
            try {
                const {text, copy} = E.toBase(evaluate(base[1]).value, E.baseOf(base[2]));
                return [row(text, `${base[1]} in ${base[2]}`, copy, DEV_ICON)];
            } catch {
                return [];
            }
        }
        if (!forced && !E.canCalculate(query))
            return [];
        let result;
        try {
            result = evaluate(query);
        } catch (e) {
            return forced ? [warningRow('Invalid expression', e.message)] : [];
        }
        const {value, usedBase, usedBitwise} = result;
        const text = formatNumber(value);
        const rows = [row(text, `${query} =`, text)];
        if ((usedBase || usedBitwise) && Number.isInteger(value) && Number.isFinite(value)) {
            for (const [radix, label] of [[16, 'Hex'], [2, 'Binary'], [8, 'Octal']]) {
                const {text: digits, copy} = E.toBase(value, radix);
                rows.push(row(digits, label, copy, DEV_ICON));
            }
        }
        return rows;
    }
}

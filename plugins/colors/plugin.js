// SPDX-License-Identifier: GPL-3.0-or-later
import * as Color from './color.js';
import {copyRow} from '../../lib/plugins/rows.js';

function grade(x) {
    return x >= 7 ? 'AAA' : x >= 4.5 ? 'AA' : x >= 3 ? 'AA large' : 'fail';
}

export default class ColorsPlugin {
    constructor(api) {
        this.api = api;
    }

    query({query, forced}) {
        const text = forced && Color.HEX_DIGITS.test(query) ? `#${query}` : query;
        if (!/^(#|rgba?\(|hsla?\()/i.test(text))
            return [];
        const c = Color.parseColor(text);
        if (!c)
            return [];
        const hex = Color.toHex({...c, a: 1});
        const formats = Color.colorFormats(c);
        const white = Color.contrast(c, {r: 255, g: 255, b: 255});
        const black = Color.contrast(c, {r: 0, g: 0, b: 0});
        const preview = {
            kind: 'Color',
            title: Color.toHex(c),
            swatches: Color.spectrum(c).map((s, i) => ({color: Color.toHex(s), base: i === 2})),
            details: [
                ...formats,
                ['On white', `${white.toFixed(2)}:1 · ${grade(white)}`],
                ['On black', `${black.toFixed(2)}:1 · ${grade(black)}`],
                ['Luminance', Color.luminance(c).toFixed(3)],
            ],
        };
        return formats.map(([kind, value]) => copyRow(value, kind, {color: hex}, {preview}));
    }
}

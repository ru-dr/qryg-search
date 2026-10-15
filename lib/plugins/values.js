// SPDX-License-Identifier: GPL-3.0-or-later

function inRange(def, value) {
    return (typeof def.min !== 'number' || value >= def.min) && (typeof def.max !== 'number' || value <= def.max);
}

export function coerce(def, value) {
    switch (def.type) {
    case 'bool':
        return typeof value === 'boolean' ? value : Boolean(def.default);
    case 'int':
        return Number.isInteger(value) && inRange(def, value) ? value : (def.default ?? 0);
    case 'strings':
        return Array.isArray(value) ? value.map(String) : (def.default ?? []);
    case 'choice':
        return def.choices?.includes(value) ? value : (def.default ?? def.choices?.[0] ?? '');
    default:
        return typeof value === 'string' ? value : (def.default ?? '');
    }
}

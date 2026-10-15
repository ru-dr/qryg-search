// SPDX-License-Identifier: GPL-3.0-or-later
import St from 'gi://St';
import Shell from 'gi://Shell';
import {isAppResult, isAppsProvider, providerName} from './providers.js';

export const RowIconSize = Object.freeze({ROW: 24, TOP_HIT: 32});

export function rowKind(row) {
    const {provider, metaInfo} = row;
    if (isAppsProvider(provider)) {
        if (!isAppResult(provider, metaInfo.id))
            return 'System action';
        const app = Shell.AppSystem.get_default().lookup_app(metaInfo.id);
        return app?.get_app_info()?.get_description() || 'Application';
    }
    if (provider.isQrygSearchPlugin)
        return provider.result(metaInfo.id)?.kind ?? providerName(provider);
    return providerName(provider);
}

export function rowIcon(row) {
    const content = row.get_child();
    const candidates = [...content.get_children(), ...(content.get_first_child()?.get_children?.() ?? [])];
    return candidates.find(child => child instanceof St.Icon) ?? null;
}

export function answerFirstCalculatorMeta(meta) {
    const match = /^\s*=\s*(-?[\d.]+(?:e[+-]?\d+)?)\s*$/i.exec(meta.description ?? '');
    if (!match)
        return meta;
    const value = Number(match[1]);
    const unit = /\s(?:in|to|as|into)\s+(.+)$/i.exec(meta.name)?.[1] ?? '';
    const digits = /^[a-z]{3}$/i.test(unit) ? 2 : 4;
    const text = value.toLocaleString('en-US', {maximumFractionDigits: digits});
    return {
        ...meta,
        name: unit ? `${text} ${unit}` : text,
        description: `${meta.name} = ${text}`,
        clipboardText: String(Number(value.toFixed(digits))),
    };
}

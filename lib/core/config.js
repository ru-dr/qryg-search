// SPDX-License-Identifier: GPL-3.0-or-later

const DEFAULT_SHORTCUT = '<Super>space';

export const Feature = Object.freeze({
    TOP_HIT: 'top-hit',
    COMPLETION: 'completion',
    BAR_ICON: 'bar-icon',
    PREVIEW: 'preview',
    FILTERS: 'filters',
    REMEMBER_QUERY: 'remember-query',
    BOUNCE: 'bounce',
    FILE_ACTIONS: 'file-actions',
    CALCULATOR_STYLE: 'calculator-style',
    KEYWORDS: 'keywords',
    ROW_ACTIONS: 'row-actions',
});

export const LOOK_KEYS = Object.freeze(['accent-color', 'corner-radius', 'opacity', 'font-size']);

export class Config {
    constructor(gsettings) {
        this.gsettings = gsettings;
    }

    feature(name) {
        return this.gsettings.get_boolean(`feature-${name}`);
    }

    get style() {
        return this.gsettings.get_string('style');
    }

    get theme() {
        return this.gsettings.get_string('theme-preference');
    }

    get width() {
        return this.gsettings.get_int('width');
    }

    get topOffset() {
        return this.gsettings.get_int('top-offset');
    }

    get maxRows() {
        return this.gsettings.get_int('max-rows');
    }

    get resultPriority() {
        return this.gsettings.get_strv('result-priority');
    }

    get placeholder() {
        return this.gsettings.get_string('placeholder');
    }

    get shortcut() {
        return this.gsettings.get_strv('toggle-shortcut')[0] ?? DEFAULT_SHORTCUT;
    }

    get disabledProviders() {
        return this.gsettings.get_strv('disabled-providers');
    }

    get accentColor() {
        return this.gsettings.get_string('accent-color');
    }

    get cornerRadius() {
        return this.gsettings.get_int('corner-radius');
    }

    get opacity() {
        return this.gsettings.get_int('opacity');
    }

    get fontSize() {
        return this.gsettings.get_int('font-size');
    }

    onChanged(keys, callback, owner) {
        this.gsettings.connectObject(...keys.flatMap(key => [`changed::${key}`, () => callback(key)]), owner);
    }

    disconnect(owner) {
        this.gsettings.disconnectObject(owner);
    }
}

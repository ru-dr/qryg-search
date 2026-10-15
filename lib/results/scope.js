// SPDX-License-Identifier: GPL-3.0-or-later
import {isAppResult, isAppsProvider} from './providers.js';

export const FilterMode = Object.freeze({
    APPS: 'apps',
    FILES: 'files',
    ACTIONS: 'actions',
    CLIPBOARD: 'clipboard',
});

const NATIVE_ACTIONS = ['org.gnome.Settings.desktop', 'org.gnome.Calculator.desktop'];

export function appInfoId(provider) {
    return provider.appInfo?.get_id() ?? null;
}

export class SearchScope {
    constructor() {
        this.filter = null;
        this.keyword = null;
    }

    reset() {
        this.filter = null;
        this.keyword = null;
    }

    queries(provider) {
        return !this.keyword || provider.id === this.keyword;
    }

    allows(provider, resultId) {
        if (this.keyword)
            return provider.id === this.keyword;
        const isApps = isAppsProvider(provider);
        const isApp = isAppResult(provider, resultId);
        const category = provider.isQrygSearchPlugin ? provider.category : null;
        switch (this.filter) {
        case FilterMode.APPS:
            return isApp || category === 'apps';
        case FilterMode.FILES:
            return category === 'files';
        case FilterMode.ACTIONS:
            return (isApps && !isApp) || category === 'actions' || NATIVE_ACTIONS.includes(appInfoId(provider));
        case FilterMode.CLIPBOARD:
            return category === 'clipboard';
        default:
            return !provider.isQrygSearchPlugin || provider.globalSearch;
        }
    }
}

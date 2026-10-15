// SPDX-License-Identifier: GPL-3.0-or-later

export const APPS_PROVIDER_ID = 'applications';
// The kinds of result people can order in Preferences. Apps come first unless they choose otherwise.
export const RESULT_KINDS = Object.freeze(['apps', 'actions', 'files', 'general', 'clipboard']);
const NATIVE_ACTIONS = ['org.gnome.Settings.desktop', 'org.gnome.Calculator.desktop'];

export function appInfoId(provider) {
    return provider.appInfo?.get_id() ?? null;
}

export function isNativeAction(provider) {
    return NATIVE_ACTIONS.includes(appInfoId(provider));
}

export function resultKind(provider) {
    if (provider.isQrygSearchPlugin)
        return RESULT_KINDS.includes(provider.category) ? provider.category : 'general';
    if (isAppsProvider(provider))
        return 'apps';
    return isNativeAction(provider) ? 'actions' : 'general';
}

// Unknown kinds are dropped and missing ones are added in their default place, so any stored list works.
export function normalizeResultPriority(list) {
    const chosen = (Array.isArray(list) ? list : []).filter((kind, i, all) => RESULT_KINDS.includes(kind) && all.indexOf(kind) === i);
    return [...chosen, ...RESULT_KINDS.filter(kind => !chosen.includes(kind))];
}

export function isAppsProvider(provider) {
    return provider.id === APPS_PROVIDER_ID;
}

export function isAppResult(provider, id) {
    return isAppsProvider(provider) && id.endsWith('.desktop');
}

export function providerName(provider) {
    return provider.displayName ?? provider.appInfo?.get_name() ?? (isAppsProvider(provider) ? 'Applications' : '');
}

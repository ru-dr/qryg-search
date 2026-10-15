// SPDX-License-Identifier: GPL-3.0-or-later

export const APPS_PROVIDER_ID = 'applications';

export function isAppsProvider(provider) {
    return provider.id === APPS_PROVIDER_ID;
}

export function isAppResult(provider, id) {
    return isAppsProvider(provider) && id.endsWith('.desktop');
}

export function providerName(provider) {
    return provider.displayName ?? provider.appInfo?.get_name() ?? (isAppsProvider(provider) ? 'Applications' : '');
}

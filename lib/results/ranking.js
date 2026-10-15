// SPDX-License-Identifier: GPL-3.0-or-later
import {isAppsProvider} from './providers.js';

export const BaseScore = Object.freeze({TOP: 90, APPS: 80, AFTER_APPS: 70, NATIVE: 50, BOTTOM: 30});

const POSITION_SCORES = {'top': BaseScore.TOP, 'after-apps': BaseScore.AFTER_APPS, 'bottom': BaseScore.BOTTOM};

export function baseScore(provider) {
    if (!provider.isQrygSearchPlugin)
        return isAppsProvider(provider) ? BaseScore.APPS : BaseScore.NATIVE;
    return POSITION_SCORES[provider.position] ?? BaseScore.BOTTOM;
}

export function rankProviders(providers, scoreOf) {
    return providers
        .map((provider, index) => ({provider, index, score: scoreOf(provider)}))
        .sort((a, b) => b.score - a.score ||
            (a.provider.priority ?? 0) - (b.provider.priority ?? 0) ||
            a.index - b.index)
        .map(entry => entry.provider);
}

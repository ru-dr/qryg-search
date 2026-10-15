// SPDX-License-Identifier: GPL-3.0-or-later
import {isAppsProvider, normalizeResultPriority, resultKind} from './providers.js';

export const BaseScore = Object.freeze({TOP: 90, APPS: 80, AFTER_APPS: 70, NATIVE: 50, BOTTOM: 30});

const POSITION_SCORES = {'top': BaseScore.TOP, 'after-apps': BaseScore.AFTER_APPS, 'bottom': BaseScore.BOTTOM};

export function baseScore(provider) {
    if (!provider.isQrygSearchPlugin)
        return isAppsProvider(provider) ? BaseScore.APPS : BaseScore.NATIVE;
    return POSITION_SCORES[provider.position] ?? BaseScore.BOTTOM;
}

// Sections are grouped by the result priority first, so a high score never lifts files above apps unless the
// person put files first. Within a group, scores and positions decide.
export function rankProviders(providers, scoreOf, priority = []) {
    const order = normalizeResultPriority(priority);
    return providers
        .map((provider, index) => ({provider, index, tier: order.indexOf(resultKind(provider)), score: scoreOf(provider)}))
        .sort((a, b) => a.tier - b.tier || b.score - a.score ||
            (a.provider.priority ?? 0) - (b.provider.priority ?? 0) ||
            a.index - b.index)
        .map(entry => entry.provider);
}

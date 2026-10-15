// SPDX-License-Identifier: GPL-3.0-or-later
export const ACTIONS = [
    {
        id: 'lock', title: 'Lock', subtitle: 'Lock the screen', icon: 'system-lock-screen-symbolic',
        words: ['lock', 'lock screen', 'screen lock'],
    },
    {
        id: 'suspend', title: 'Suspend', subtitle: 'Suspend the computer', icon: 'weather-clear-night-symbolic',
        words: ['suspend', 'sleep'],
    },
    {
        id: 'hibernate', title: 'Hibernate', subtitle: 'Save the session to disk and power off', icon: 'weather-clear-night-symbolic',
        words: ['hibernate'], strict: true,
    },
    {
        id: 'logout', title: 'Log Out', subtitle: 'End the session, after a confirmation', icon: 'system-log-out-symbolic',
        words: ['log out', 'logout', 'sign out', 'signout', 'log off', 'logoff'],
    },
    {
        id: 'restart', title: 'Restart', subtitle: 'Restart the computer, after a confirmation', icon: 'system-reboot-symbolic',
        words: ['restart', 'reboot'],
    },
    {
        id: 'poweroff', title: 'Power Off', subtitle: 'Shut down the computer, after a confirmation', icon: 'system-shutdown-symbolic',
        words: ['power off', 'poweroff', 'shutdown', 'shut down', 'turn off'],
    },
];

const MIN_PREFIX = 3;

export function normalize(query) {
    return query.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function matchScore(action, query) {
    const q = normalize(query);
    if (q.length < MIN_PREFIX)
        return 0;
    let best = 0;
    for (const word of action.words) {
        if (word === q)
            return 95;
        if (word.startsWith(q))
            best = Math.max(best, 40 + Math.round(30 * q.length / word.length));
    }
    return best;
}

// `available` maps action ids to booleans. An action missing from it is shown, unless it is strict.
export function allowed(action, available) {
    const known = available?.[action.id];
    return known === undefined ? !action.strict : Boolean(known);
}

export function match(query, available) {
    return ACTIONS
        .map(action => ({action, score: matchScore(action, query)}))
        .filter(({action, score}) => score > 0 && allowed(action, available))
        .sort((a, b) => b.score - a.score);
}

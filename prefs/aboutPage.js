// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import {page, group} from './widgets.js';

export function buildAboutPage({metadata}) {
    const rows = [
        ['QryG Search', 'A launcher with plugins'],
        ['Version', metadata['version-name'] ?? ''],
        ['Source', metadata.url ?? ''],
        ['Based on', 'Spotlight by itsnin'],
        ['License', 'GPL-3.0-or-later'],
    ].map(([title, subtitle]) => new Adw.ActionRow({title, subtitle, use_markup: false}));
    return page('About', 'help-about-symbolic', [group('About', rows)]);
}

// SPDX-License-Identifier: GPL-3.0-or-later
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {matchWords} from '../../lib/plugins/text.js';

// Below the apps section, so typing an app's name still puts the app itself first.
const MAX_SCORE = 75;

export default class WindowsPlugin {
    constructor(api) {
        this.api = api;
    }

    query({query}) {
        const tracker = Shell.WindowTracker.get_default();
        const rows = [];
        for (const win of global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null)) {
            const app = tracker.get_window_app(win);
            const title = win.get_title() ?? '';
            const appName = app?.get_name() ?? '';
            const score = matchWords([title, appName], query);
            if (score === null)
                continue;
            const ws = win.get_workspace();
            const where = ws ? `Workspace ${ws.index() + 1}` : '';
            rows.push({
                id: `${win.get_stable_sequence()}`,
                title: title || appName,
                subtitle: [appName, where, 'Switch to window'].filter(Boolean).join(' · '),
                icon: app ? {app: app.get_id()} : 'focus-windows-symbolic',
                kind: 'Window',
                score: query ? Math.min(score, MAX_SCORE) : undefined,
                run: () => Main.activateWindow(win),
                preview: {kind: 'Window', details: [['App', appName], ['Where', where]]},
            });
        }
        return rows;
    }
}

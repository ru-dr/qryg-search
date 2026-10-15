// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import {ACTIONS, allowed, match} from './actions.js';

Gio._promisify(Gio.DBusConnection.prototype, 'call');

const LOGIND = ['org.freedesktop.login1', '/org/freedesktop/login1', 'org.freedesktop.login1.Manager'];
// Lets the launcher close and release its grab before the lock screen or a dialog opens.
const DELAY_MS = 150;

export default class SessionPlugin {
    constructor(api) {
        this.api = api;
        this._system = SystemActions.getDefault();
        this._canHibernate = null;
        this._timeoutId = 0;
    }

    async _hibernate() {
        if (this._canHibernate === null) {
            try {
                const reply = await Gio.DBus.system.call(...LOGIND, 'CanHibernate', null,
                    new GLib.VariantType('(s)'), Gio.DBusCallFlags.NONE, 1000, null);
                const [answer] = reply.deepUnpack();
                this._canHibernate = answer === 'yes' || answer === 'challenge';
            } catch {
                this._canHibernate = false;
            }
        }
        return this._canHibernate;
    }

    async _available() {
        const s = this._system;
        return {
            lock: s.can_lock_screen,
            suspend: s.can_suspend,
            hibernate: await this._hibernate(),
            restart: s.can_restart,
            poweroff: s.can_power_off,
        };
    }

    _later(fn) {
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DELAY_MS, () => {
            this._timeoutId = 0;
            try {
                fn();
            } catch (e) {
                this.api.log(e.message);
                this.api.notify('Session action failed', e.message);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _activate(id) {
        const s = this._system;
        switch (id) {
        case 'lock':
            s.activateLockScreen();
            break;
        case 'suspend':
            s.activateSuspend();
            break;
        case 'hibernate':
            Gio.DBus.system.call(...LOGIND, 'Hibernate', new GLib.Variant('(b)', [true]),
                null, Gio.DBusCallFlags.NONE, -1, null).catch(e => this.api.log('hibernate failed:', e.message));
            break;
        case 'logout':
            this._quit('--logout', () => s.activateLogout());
            break;
        case 'restart':
            this._quit('--reboot', () => s.activateRestart());
            break;
        case 'poweroff':
            this._quit('--power-off', () => s.activatePowerOff());
            break;
        }
    }

    // gnome-session-quit shows GNOME's own confirmation dialog.
    _quit(flag, fallback) {
        if (GLib.find_program_in_path('gnome-session-quit'))
            this.api.spawn(['gnome-session-quit', flag]);
        else
            fallback();
    }

    async query({query, forced}) {
        const available = await this._available();
        const found = forced && !query
            ? ACTIONS.filter(action => allowed(action, available)).map(action => ({action, score: 50}))
            : match(query, available);
        return found.map(({action, score}) => ({
            id: action.id,
            title: action.title,
            subtitle: action.subtitle,
            icon: action.icon,
            kind: 'Session',
            score,
            run: () => this._later(() => this._activate(action.id)),
            preview: {title: action.title, kind: 'Session', icon: action.icon, body: action.subtitle},
        }));
    }

    destroy() {
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = 0;
    }
}

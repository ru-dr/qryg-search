// SPDX-License-Identifier: GPL-3.0-or-later
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {App} from './lib/app.js';

export default class QrygSearchExtension extends Extension {
    enable() {
        this._app = new App(this.getSettings());
        this._app.enable();
    }

    disable() {
        this._app.disable();
        this._app = null;
    }
}

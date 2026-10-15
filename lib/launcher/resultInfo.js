// SPDX-License-Identifier: GPL-3.0-or-later
import Shell from 'gi://Shell';
import {expandPath} from '../plugins/host.js';

export class ResultInfo {
    constructor(row) {
        this.row = row;
        this.provider = row.provider;
        this.id = row.metaInfo.id;
        this.plugin = this.provider.isQrygSearchPlugin ? this.provider.result(this.id) : null;
    }

    get isApp() {
        return this.provider.id === 'applications' && this.id.endsWith('.desktop');
    }

    get app() {
        return this.isApp ? Shell.AppSystem.get_default().lookup_app(this.id) : null;
    }

    get path() {
        const path = this.plugin?.path;
        return typeof path === 'string' && path ? expandPath(path) : null;
    }

    get copyText() {
        if (!this.provider.isQrygSearchPlugin)
            return this.row.metaInfo.clipboardText ?? null;
        const copy = this.plugin?.copy;
        return copy !== undefined && copy !== null && copy !== '' ? String(copy) : this.path;
    }

    get bookmarkTarget() {
        const target = this.plugin?.bookmark;
        return typeof target === 'string' && target ? target : null;
    }

    get bookmarkName() {
        const name = this.plugin?.bookmarkName;
        return typeof name === 'string' ? name : null;
    }

    get pluginActions() {
        const actions = this.plugin?.actions;
        return Array.isArray(actions) ? actions.filter(a => a && typeof a.id === 'string').slice(0, 4) : [];
    }
}

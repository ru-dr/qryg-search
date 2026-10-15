// SPDX-License-Identifier: GPL-3.0-or-later
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {SourceTracker} from '../core/sources.js';
import {Backdrop} from './backdrop.js';
import {CloseGuard} from './closeGuard.js';
import {Placement} from './placement.js';

const RELEASE_TIMEOUT_MS = 400;

export const LauncherWindow = GObject.registerClass(
class LauncherWindow extends St.Widget {
    _init({config, theme, launcher, takeover}) {
        super._init({
            layout_manager: new Clutter.BinLayout(),
            reactive: true,
            can_focus: true,
            visible: false,
            pivot_point: new Graphene.Point({x: 0.5, y: 0}),
        });
        this._theme = theme;
        this._launcher = launcher;
        this._takeover = takeover;
        this._sources = new SourceTracker();
        this._content = new St.BoxLayout({style_class: 'qryg-search-container qryg-search-custom qryg-search-user', orientation: Clutter.Orientation.VERTICAL});
        this.add_child(this._content);
        this._placement = new Placement(config, this, this._content);
        this._guard = new CloseGuard(() => this.close(), () => this._launcher.stepBack());
        this._backdrop = null;
        this._unredirectOff = false;
        this.isOpen = false;
    }

    open() {
        if (this.isOpen || this._sources.isPending('open'))
            return;
        this._sources.cancel('close');
        this._sources.idle('open', () => this._show());
    }

    close() {
        if (!this.isOpen && !this._sources.isPending('open'))
            return;
        this._sources.cancel('open');
        if (!this._sources.isPending('close'))
            this._sources.idle('close', () => this._hide());
    }

    closeAfterRelease() {
        if (!this.isOpen || this._sources.isPending('release'))
            return;
        global.stage.connectObject('captured-event', (_stage, event) => {
            if (event.type() !== Clutter.EventType.KEY_RELEASE)
                return Clutter.EVENT_PROPAGATE;
            this._finishReleaseClose();
            return Clutter.EVENT_STOP;
        }, this);
        this._sources.timeout('release', RELEASE_TIMEOUT_MS, () => this._finishReleaseClose());
    }

    refreshTheme() {
        if (this.isOpen)
            this._theme.applyTo(this._content);
    }

    _finishReleaseClose() {
        this._sources.cancel('release');
        global.stage.disconnectObject(this);
        this.close();
    }

    _show() {
        this._launcher.mount(this._content);
        this._theme.applyTo(this._content);
        const monitor = this._placement.monitor();
        this._backdrop = new Backdrop(monitor, () => this.close());
        if (this.get_parent())
            Main.layoutManager.removeChrome(this);
        Main.layoutManager.addChrome(this);
        this._setUnredirect(false);
        this._placement.place(monitor);
        this._launcher.onOpen();
        this._placement.animateIn();
        this._launcher.onShown();
        this._guard.install({window: this, entry: this._takeover.entry, results: this._takeover.controller});
        this.isOpen = true;
    }

    _hide() {
        this.isOpen = false;
        this._launcher.onClose();
        this._guard.uninstall();
        this._sources.cancel('release');
        global.stage.disconnectObject(this);
        this._backdrop?.destroy();
        this._backdrop = null;
        this._launcher.unmount(this._content);
        this._placement.animateOut(() => {
            this._setUnredirect(true);
            if (this.get_parent())
                Main.layoutManager.removeChrome(this);
        });
    }

    _setUnredirect(enabled) {
        if (enabled === !this._unredirectOff)
            return;
        if (enabled)
            global.compositor.enable_unredirect();
        else
            global.compositor.disable_unredirect();
        this._unredirectOff = !enabled;
    }

    hideNow() {
        this._sources.clear();
        if (this.isOpen)
            this._hide();
        this.remove_all_transitions();
        this._setUnredirect(true);
        if (this.get_parent())
            Main.layoutManager.removeChrome(this);
    }

    destroy() {
        this.hideNow();
        super.destroy();
    }
});

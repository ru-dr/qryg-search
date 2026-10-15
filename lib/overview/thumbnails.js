// SPDX-License-Identifier: GPL-3.0-or-later
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {SecondaryMonitorDisplay} from 'resource:///org/gnome/shell/ui/workspacesView.js';
import {WorkspaceThumbnail} from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js';
import {BackgroundManager} from 'resource:///org/gnome/shell/ui/background.js';
import {Patcher} from '../core/patcher.js';

const MAX_THUMBNAIL_SCALE = 0.1;

export class ThumbnailTweaks {
    constructor() {
        this._patcher = new Patcher();
        this._secondaryBoxes = new Map();
    }

    enable() {
        this._patcher.set(Main.overview._overview._controls._thumbnailsBox, '_maxThumbnailScale', MAX_THUMBNAIL_SCALE);
        this._patchSecondaryMonitors();
        this._patchWallpaper();
    }

    disable() {
        for (const [box, scale] of this._secondaryBoxes) {
            box._maxThumbnailScale = scale;
            box.disconnectObject(this);
        }
        this._secondaryBoxes.clear();
        this._patcher.restoreAll();
    }

    _patchSecondaryMonitors() {
        const boxes = this._secondaryBoxes;
        const owner = this;
        this._patcher.replace(SecondaryMonitorDisplay.prototype, '_getThumbnailsHeight', original => function (box) {
            const thumbnails = this._thumbnails;
            if (!thumbnails?.visible)
                return 0;
            if (!boxes.has(thumbnails)) {
                boxes.set(thumbnails, thumbnails._maxThumbnailScale);
                thumbnails.connectObject('destroy', () => boxes.delete(thumbnails), owner);
            }
            thumbnails._maxThumbnailScale = MAX_THUMBNAIL_SCALE;
            const result = original.call(this, box);
            return Number.isFinite(result) ? result : 0;
        });
    }

    _patchWallpaper() {
        this._patcher.replace(WorkspaceThumbnail.prototype, '_init', original => function (workspace, monitorIndex) {
            original.call(this, workspace, monitorIndex);
            if (!this._contents || monitorIndex < 0 || monitorIndex >= Main.layoutManager.monitors.length)
                return;
            this._qrygSearchBackground = new BackgroundManager({monitorIndex, container: this._contents, vignette: false});
            const relayout = () => this._qrygSearchBackground?.backgroundActor?.queue_relayout();
            this._qrygSearchBackgroundIds = [
                this._qrygSearchBackground.connect('loaded', relayout),
                this._qrygSearchBackground.connect('changed', relayout),
            ];
        });
        this._patcher.replace(WorkspaceThumbnail.prototype, '_onDestroy', original => function () {
            original.call(this);
            if (!this._qrygSearchBackground)
                return;
            for (const id of this._qrygSearchBackgroundIds ?? [])
                this._qrygSearchBackground.disconnect(id);
            this._qrygSearchBackground.destroy();
            this._qrygSearchBackground = null;
            this._qrygSearchBackgroundIds = null;
        });
    }
}

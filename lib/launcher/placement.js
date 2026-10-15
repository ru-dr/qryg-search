// SPDX-License-Identifier: GPL-3.0-or-later
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Feature} from '../core/config.js';
import {maxHeightStyle} from '../core/css.js';
import {animationsEnabled} from '../core/motion.js';

const MAX_SCREEN_WIDTH = 0.85;
const START_SCALE = 0.94;
const FADE_IN_MS = 140;
const BOUNCE_MS = 320;
const EASE_MS = 180;
const FADE_OUT_MS = 150;

function resetTransform(actor) {
    actor.remove_all_transitions();
    actor.opacity = 255;
    actor.scale_x = 1;
    actor.scale_y = 1;
}

export class Placement {
    constructor(config, actor, content) {
        this._config = config;
        this._actor = actor;
        this._content = content;
    }

    monitor() {
        const [x, y] = global.get_pointer();
        return Main.layoutManager.monitors.find(m =>
            x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height) ?? Main.layoutManager.primaryMonitor;
    }

    place(monitor) {
        const width = Math.min(this._config.width, Math.floor(monitor.width * MAX_SCREEN_WIDTH));
        this._actor.set_width(width);
        this._content.set_width(width);
        this._content.style = maxHeightStyle({
            monitorHeight: monitor.height,
            topOffset: this._config.topOffset,
            scale: St.ThemeContext.get_for_stage(global.stage).scale_factor,
        });
        this._actor.set_position(
            Math.floor(monitor.x + (monitor.width - width) / 2),
            Math.floor(monitor.y + monitor.height * this._config.topOffset / 100));
    }

    animateIn() {
        resetTransform(this._actor);
        this._actor.show();
        if (!animationsEnabled())
            return;
        const bounce = this._config.feature(Feature.BOUNCE);
        this._actor.opacity = 0;
        this._actor.scale_x = START_SCALE;
        this._actor.scale_y = START_SCALE;
        this._actor.ease({opacity: 255, duration: FADE_IN_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this._actor.ease({
            scale_x: 1,
            scale_y: 1,
            duration: bounce ? BOUNCE_MS : EASE_MS,
            mode: bounce ? Clutter.AnimationMode.EASE_OUT_BACK : Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    animateOut(onDone) {
        const finish = () => {
            this._actor.hide();
            resetTransform(this._actor);
            onDone();
        };
        this._actor.remove_all_transitions();
        if (!animationsEnabled()) {
            finish();
            return;
        }
        this._actor.ease({opacity: 0, duration: FADE_OUT_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD, onComplete: finish});
    }
}

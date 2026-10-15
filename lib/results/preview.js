// SPDX-License-Identifier: GPL-3.0-or-later
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import {animationsEnabled} from '../core/motion.js';
import {expandPath, tildify, iconActor} from '../plugins/host.js';

const ICON_SIZE = 64;
const THUMB_SIZE = 160;
const MAX_CODE_LINES = 22;
const FADE_IN_MS = 100;
const SWAP_START_OPACITY = 128;

function nativePreview(row) {
    const {provider, metaInfo: meta} = row;
    if (provider.id === 'applications') {
        const app = Shell.AppSystem.get_default().lookup_app(meta.id);
        const file = app?.get_app_info()?.get_filename();
        return {
            kind: app ? 'Application' : 'System Action',
            body: app?.get_app_info()?.get_description() ?? '',
            details: file ? [['Where', tildify(GLib.path_get_dirname(file))]] : [],
        };
    }
    return {
        kind: provider.displayName ?? provider.appInfo?.get_name() ?? '',
        body: meta.description ?? '',
    };
}

export class PreviewPane {
    constructor({onCopied}) {
        this.actor = new St.BoxLayout({
            style_class: 'qryg-search-preview',
            orientation: Clutter.Orientation.VERTICAL,
            y_expand: true,
            visible: false,
        });
        this._current = null;
        this._onCopied = onCopied;
    }

    show(row) {
        if (row === this._current)
            return;
        this._current = row;
        const wasVisible = this.actor.visible;
        this.actor.destroy_all_children();
        if (!row) {
            this._hide();
            return;
        }
        const {provider, metaInfo: meta} = row;
        const p = (provider.isQrygSearchPlugin ? provider.preview(meta.id) : nativePreview(row)) ?? {};
        const result = provider.isQrygSearchPlugin ? provider.result(meta.id) : null;

        const visual = this._visual(p, provider, meta);
        if (visual instanceof St.Icon)
            visual.icon_size = visual.style_class === 'qryg-search-preview-thumb' ? THUMB_SIZE : ICON_SIZE;
        if (visual) {
            if (!visual.x_expand)
                visual.x_align = Clutter.ActorAlign.CENTER;
            this.actor.add_child(visual);
        }

        const title = p.title ?? meta.name;
        this.actor.accessible_name = title ? `Preview: ${title}` : 'Preview';
        this.actor.add_child(this._label('qryg-search-preview-title', title));
        const kind = p.kind ?? result?.kind ?? provider.displayName;
        if (kind)
            this.actor.add_child(this._label('qryg-search-preview-kind', kind));
        if (typeof p.code === 'string' && p.code) {
            let code = p.code;
            const lines = code.split('\n');
            if (lines.length > MAX_CODE_LINES)
                code = `${lines.slice(0, MAX_CODE_LINES).join('\n')}\n… ${lines.length - MAX_CODE_LINES} more lines`;
            this.actor.add_child(this._label('qryg-search-preview-code', code));
        }
        if (typeof p.body === 'string' && p.body)
            this.actor.add_child(this._label('qryg-search-preview-body', p.body));
        const details = Array.isArray(p.details) ? p.details.filter(d => Array.isArray(d) && d.length === 2) : [];
        if (details.length > 0) {
            this.actor.add_child(new St.Widget({style_class: 'qryg-search-preview-separator'}));
            for (const [key, value] of details) {
                const line = new St.BoxLayout({style_class: 'qryg-search-preview-row'});
                line.add_child(this._label('qryg-search-preview-key', String(key)));
                const val = this._label('qryg-search-preview-value', String(value));
                val.x_expand = true;
                line.add_child(val);
                this.actor.add_child(line);
            }
        }
        this._fadeIn(wasVisible ? SWAP_START_OPACITY : 0);
    }

    _fadeIn(from) {
        this.actor.remove_transition('opacity');
        this.actor.show();
        if (!animationsEnabled()) {
            this.actor.opacity = 255;
            return;
        }
        this.actor.opacity = from;
        this.actor.ease({opacity: 255, duration: FADE_IN_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    _hide() {
        this.actor.remove_transition('opacity');
        this.actor.opacity = 255;
        this.actor.hide();
    }

    _visual(p, provider, meta) {
        if (Array.isArray(p.swatches) && p.swatches.length > 0)
            return this._swatches(p.swatches);
        if (typeof p.image === 'string' && GLib.file_test(expandPath(p.image), GLib.FileTest.EXISTS))
            return new St.Icon({style_class: 'qryg-search-preview-thumb', gicon: Gio.FileIcon.new(Gio.File.new_for_path(expandPath(p.image))), icon_size: THUMB_SIZE});
        if (p.icon)
            return iconActor(p.icon, ICON_SIZE, provider.manifest?.dir);
        return meta.createIcon?.(ICON_SIZE) ?? null;
    }

    _swatches(swatches) {
        const strip = new St.BoxLayout({style_class: 'qryg-search-spectrum', x_expand: true});
        for (const s of swatches.slice(0, 8)) {
            const color = typeof s === 'string' ? s : s?.color;
            if (typeof color !== 'string')
                continue;
            const cell = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                x_expand: true,
                style_class: 'qryg-search-spectrum-cell',
            });
            cell.add_child(new St.Widget({
                style_class: s?.base ? 'qryg-search-spectrum-swatch qryg-search-spectrum-base' : 'qryg-search-spectrum-swatch',
                style: `background-color: ${color};`,
                x_expand: true,
            }));
            cell.add_child(new St.Label({style_class: 'qryg-search-spectrum-hex', text: s?.label ?? color, x_align: Clutter.ActorAlign.CENTER}));
            const button = new St.Button({child: cell, x_expand: true, can_focus: false, accessible_name: `Copy ${color}`});
            button.connect('clicked', () => {
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, color);
                this._onCopied();
            });
            strip.add_child(button);
        }
        return strip;
    }

    _label(styleClass, text) {
        const label = new St.Label({style_class: styleClass, text: text ?? ''});
        label.clutter_text.set({
            line_wrap: true,
            line_wrap_mode: Pango.WrapMode.WORD_CHAR,
            ellipsize: Pango.EllipsizeMode.NONE,
        });
        return label;
    }

    reset() {
        this._current = null;
        this.actor.destroy_all_children();
        this._hide();
    }

    destroy() {
        this.actor.destroy();
    }
}

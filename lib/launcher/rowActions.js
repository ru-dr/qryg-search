// SPDX-License-Identifier: GPL-3.0-or-later
import St from 'gi://St';
import Clutter from 'gi://Clutter';

export class RowActionsView {
    constructor() {
        this._row = null;
        this._box = null;
    }

    isShowing(row) {
        return this._row === row;
    }

    invalidate() {
        this._row = null;
    }

    show(row, actions) {
        this._box?.destroy();
        this._box = null;
        this._row = row;
        if (!row || actions.length === 0)
            return;
        const box = new St.BoxLayout({style_class: 'qryg-search-row-actions', x_expand: true, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.CENTER});
        for (const action of actions) {
            const button = new St.Button({
                style_class: 'qryg-search-row-action',
                can_focus: false,
                accessible_name: action.label,
                child: new St.Icon({icon_name: action.icon, style_class: 'qryg-search-row-action-icon'}),
            });
            button.connect('clicked', () => action.run());
            box.add_child(button);
        }
        const content = row.get_child();
        content.x_align = Clutter.ActorAlign.FILL;
        content.add_child(box);
        box.connect('destroy', () => {
            if (this._box === box) {
                this._box = null;
                this._row = null;
            }
        });
        this._box = box;
    }
}

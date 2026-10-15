// SPDX-License-Identifier: GPL-3.0-or-later
// No GNOME imports, so it can be tested with node.

export function copyRow(title, subtitle, icon, extra = {}) {
    const copy = extra.copy ?? title;
    return {title, subtitle, icon, ...extra, copy, activate: {copy}};
}

export function warningRow(title, subtitle) {
    return {title, subtitle, icon: 'dialog-warning-symbolic'};
}

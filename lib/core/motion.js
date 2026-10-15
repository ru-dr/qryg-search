// SPDX-License-Identifier: GPL-3.0-or-later
import St from 'gi://St';

export function animationsEnabled() {
    return St.Settings.get()?.enable_animations ?? true;
}

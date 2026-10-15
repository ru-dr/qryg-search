// SPDX-License-Identifier: GPL-3.0-or-later

const SELECTED_STATES = [':selected', ':focus', ':selected:hover', ':focus:hover'];
export const DEFAULT_FONT_SIZE = 20;
const MAX_HEIGHT = 560;
const MIN_HEIGHT = 200;
const SCREEN_BOTTOM_MARGIN = 48;
const ROW_MIN = 13;
const SMALL_MIN = 10;

const TEXT_SIZES = Object.freeze([
    {selector: ' .list-search-result', base: 14, min: ROW_MIN},
    {selector: ' .list-search-result.qryg-search-top-hit', base: 15, min: ROW_MIN},
    {selector: ' .list-search-result .list-search-result-description', base: 13, min: SMALL_MIN},
    {selector: ' .qryg-search-section-header', base: 12, min: SMALL_MIN},
    {selector: ' .search-statustext', base: 14, min: ROW_MIN},
    {selector: ' .qryg-search-preview-title', base: 15, min: ROW_MIN},
    {selector: ' .qryg-search-preview-kind', base: 12, min: SMALL_MIN},
    {selector: ' .qryg-search-preview-body', base: 12, min: SMALL_MIN},
    {selector: ' .qryg-search-preview-code', base: 11, min: SMALL_MIN},
    {selector: ' .qryg-search-preview-key', base: 11, min: SMALL_MIN},
    {selector: ' .qryg-search-preview-value', base: 11, min: SMALL_MIN},
    {selector: ' .qryg-search-spectrum-hex', base: 10, min: SMALL_MIN},
]);

export function scaledSize(base, font, min) {
    return Math.max(min, Math.round(base * font / DEFAULT_FONT_SIZE));
}

export function textSizes(font) {
    return TEXT_SIZES.map(({selector, base, min}) => ({selector, size: scaledSize(base, font, min)}));
}

export function maxHeightStyle({monitorHeight, topOffset, scale = 1}) {
    const below = Math.floor(monitorHeight * (100 - topOffset) / 100 / scale) - SCREEN_BOTTOM_MARGIN;
    return below < MAX_HEIGHT ? `max-height: ${Math.max(MIN_HEIGHT, below)}px;` : null;
}

function parseHex(hex) {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    const value = parseInt(match ? match[1] : '0a84ff', 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function important(css) {
    return css.replace(/:\s*([^;{}]+?)\s*(!important)?\s*;/g, ': $1 !important;');
}

function selectors(scopes, suffixes) {
    return scopes.flatMap(scope => suffixes.map(suffix => `${scope}${suffix}`)).join(', ');
}

function commonRules(look) {
    const {dark, light, accent, rgb, font} = look;
    const entries = selectors([dark, light], [' .qryg-search-bar StEntry', ' .qryg-search-bar StEntry:hover', ' .qryg-search-bar StEntry:focus']);
    return `
${entries} { caret-color: ${accent}; selection-background-color: rgba(${rgb}, 0.4); font-size: ${font}px; }
${dark} .qryg-search-ghost { font-size: ${font}px; }
${selectors([dark, light], [' .qryg-search-filter-button:checked'])} { background-color: ${accent}; }
${textSizes(font).map(({selector, size}) => `${dark}${selector} { font-size: ${size}px; }`).join('\n')}
`;
}

function macRules(look) {
    const {dark, light, accent, alpha, radius, font} = look;
    const line = Math.max(34, Math.round(font * 1.5));
    const bar = Math.min(Math.round((line + 24) / 2), radius + 3);
    const entries = selectors([dark, light], [' .qryg-search-bar StEntry', ' .qryg-search-bar StEntry:hover', ' .qryg-search-bar StEntry:focus']);
    const selected = selectors([dark, light], SELECTED_STATES.map(s => ` .list-search-result${s}`));
    return `
${dark} .qryg-search-bar, ${dark} .qryg-search-results { background-color: rgba(36, 36, 38, ${alpha}); }
${light} .qryg-search-bar, ${light} .qryg-search-results { background-color: rgba(248, 248, 250, ${alpha}); }
${dark} .qryg-search-results { border-radius: ${radius}px; }
${dark} .qryg-search-bar { border-radius: ${bar}px; }
${entries} { min-height: ${line}px; }
${dark} .list-search-result { border-radius: ${Math.round(radius * 0.4)}px; }
${dark} .qryg-search-preview { border-radius: ${Math.round(radius * 0.7)}px; }
${dark} .qryg-search-filter-button { border-radius: ${Math.round(bar * 0.55)}px; }
${selected} { background-color: ${accent}; }
`;
}

export const ROOT = '.qryg-search-container.qryg-search-custom';
export const USER_ROOT = `${ROOT}.qryg-search-user`;

export function buildCss(config) {
    const rgb = parseHex(config.accentColor).join(', ');
    const look = {
        dark: ROOT,
        light: `${ROOT}.theme-light`,
        rgb,
        accent: `rgb(${rgb})`,
        alpha: config.opacity / 100,
        radius: config.cornerRadius,
        font: config.fontSize,
    };
    return important(commonRules(look) + macRules(look));
}

function scopeSelector(selector) {
    const s = selector.trim();
    if (!s)
        return null;
    const rest = s.replace(/^\.qryg-search-container\b/, '');
    if (rest !== s || s.startsWith('.theme-light') || s.startsWith(':'))
        return `${USER_ROOT}${rest}`;
    return `${USER_ROOT} ${s}`;
}

export function scopeUserCss(text) {
    const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [];
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const scoped = match[1].split(',').map(scopeSelector).filter(Boolean);
        const body = match[2].trim();
        if (scoped.length > 0 && body)
            rules.push(`${scoped.join(', ')} { ${body.endsWith(';') ? body : `${body};`} }`);
    }
    return important(rules.join('\n'));
}

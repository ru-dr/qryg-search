// SPDX-License-Identifier: GPL-3.0-or-later

const SELECTED_STATES = [':selected', ':focus', ':selected:hover', ':focus:hover'];
const ENTRY_STATES = ['', ':hover', ':focus'];
const DEFAULT_FONT_SIZE = 20;
const MAX_HEIGHT = 560;
const MIN_HEIGHT = 200;
const SCREEN_BOTTOM_MARGIN = 48;
const ROW_MIN = 13;
const SMALL_MIN = 10;
const SELECTION_ALPHA = 0.4;
const DARK_BACKGROUND = '36, 36, 38';
const LIGHT_BACKGROUND = '248, 248, 250';
const MIN_LINE_HEIGHT = 34;
const LINE_HEIGHT_RATIO = 1.5;
const BAR_EXTRA_HEIGHT = 24;
const BAR_RADIUS_EXTRA = 3;
const ROW_RADIUS_RATIO = 0.4;
const PREVIEW_RADIUS_RATIO = 0.7;
const FILTER_RADIUS_RATIO = 0.55;

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
    {selector: ' .qryg-search-preview-example-query', base: 11, min: SMALL_MIN},
    {selector: ' .qryg-search-preview-example-text', base: 11, min: SMALL_MIN},
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

function lookRules(look) {
    const {base, light, accent, rgb, alpha, radius, font} = look;
    const both = [base, light];
    const line = Math.max(MIN_LINE_HEIGHT, Math.round(font * LINE_HEIGHT_RATIO));
    const bar = Math.min(Math.round((line + BAR_EXTRA_HEIGHT) / 2), radius + BAR_RADIUS_EXTRA);
    const entries = selectors(both, ENTRY_STATES.map(s => ` .qryg-search-bar StEntry${s}`));
    const selected = selectors(both, SELECTED_STATES.map(s => ` .list-search-result${s}`));
    return `
${entries} { caret-color: ${accent}; selection-background-color: rgba(${rgb}, ${SELECTION_ALPHA}); font-size: ${font}px; }
${base} .qryg-search-ghost { font-size: ${font}px; }
${selectors(both, [' .qryg-search-filter-button:checked'])} { background-color: ${accent}; }
${textSizes(font).map(({selector, size}) => `${base}${selector} { font-size: ${size}px; }`).join('\n')}

${base} .qryg-search-bar, ${base} .qryg-search-results { background-color: rgba(${DARK_BACKGROUND}, ${alpha}); }
${light} .qryg-search-bar, ${light} .qryg-search-results { background-color: rgba(${LIGHT_BACKGROUND}, ${alpha}); }
${base} .qryg-search-results { border-radius: ${radius}px; }
${base} .qryg-search-bar { border-radius: ${bar}px; }
${entries} { min-height: ${line}px; }
${base} .list-search-result { border-radius: ${Math.round(radius * ROW_RADIUS_RATIO)}px; }
${base} .qryg-search-preview { border-radius: ${Math.round(radius * PREVIEW_RADIUS_RATIO)}px; }
${base} .qryg-search-filter-button { border-radius: ${Math.round(bar * FILTER_RADIUS_RATIO)}px; }
${selected} { background-color: ${accent}; }
`;
}

const BASE_CLASSES = ['qryg-search-container', 'qryg-search-custom'];
const USER_CLASS = 'qryg-search-user';
export const CONTAINER_CLASSES = [...BASE_CLASSES, USER_CLASS].join(' ');
const ROOT = BASE_CLASSES.map(c => `.${c}`).join('');
export const USER_ROOT = `${ROOT}.${USER_CLASS}`;

export function buildCss(config) {
    const rgb = parseHex(config.accentColor).join(', ');
    const look = {
        base: ROOT,
        light: `${ROOT}.theme-light`,
        rgb,
        accent: `rgb(${rgb})`,
        alpha: config.opacity / 100,
        radius: config.cornerRadius,
        font: config.fontSize,
    };
    return important(lookRules(look));
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

// SPDX-License-Identifier: GPL-3.0-or-later
// The expression parser and number formatting shared by the calculator, units and currency plugins. No GNOME imports.

const FUNCS = {
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp,
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    ln: Math.log, log2: Math.log2, log10: Math.log10,
    log: (x, b) => b === undefined ? Math.log10(x) : Math.log(x) / Math.log(b),
    floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc, sign: Math.sign,
    min: Math.min, max: Math.max, pow: Math.pow, hypot: Math.hypot,
    deg: x => x * 180 / Math.PI, rad: x => x * Math.PI / 180,
    fact: x => factorial(x),
    gcd: (a, b) => gcd(a, b),
    lcm: (a, b) => Math.abs(a * b) / gcd(a, b),
    avg: (...xs) => xs.reduce((s, x) => s + x, 0) / xs.length,
    sum: (...xs) => xs.reduce((s, x) => s + x, 0),
};
const CONSTS = {pi: Math.PI, 'π': Math.PI, e: Math.E, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2};

export const FUNCTION_NAMES = Object.keys(FUNCS);

function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) [a, b] = [b, a % b];
    return a;
}

function factorial(x) {
    if (!Number.isInteger(x) || x < 0 || x > 170)
        throw new Error('factorial needs a whole number from 0 to 170');
    let r = 1;
    for (let i = 2; i <= x; i++)
        r *= i;
    return r;
}

const TOKEN = /\s*(0x[0-9a-f_]+|0b[01_]+|0o[0-7_]+|(?:\d[\d_]*\.?\d*|\.\d+)(?:e[+-]?\d+)?|\*\*|<<|>>|\/\/|[a-zπ_][a-z0-9_]*|[-+*/%^&|~(),!])/iy;

function tokenize(src) {
    const out = [];
    TOKEN.lastIndex = 0;
    let pos = 0;
    while (pos < src.length) {
        if (/^\s*$/.test(src.slice(pos)))
            break;
        TOKEN.lastIndex = pos;
        const m = TOKEN.exec(src);
        if (!m)
            throw new Error(`unexpected "${src.slice(pos).trim()[0]}"`);
        out.push(m[1]);
        pos = TOKEN.lastIndex;
    }
    return out;
}

function parseNumber(tok) {
    const t = tok.replace(/_/g, '').toLowerCase();
    if (t.startsWith('0x'))
        return {value: parseInt(t.slice(2), 16), base: 16};
    if (t.startsWith('0b'))
        return {value: parseInt(t.slice(2), 2), base: 2};
    if (t.startsWith('0o'))
        return {value: parseInt(t.slice(2), 8), base: 8};
    return {value: Number(t), base: 10};
}

function toBig(x) {
    if (!Number.isInteger(x))
        throw new Error('bitwise operators need whole numbers');
    return BigInt(x);
}

class Parser {
    constructor(tokens) {
        this.t = tokens;
        this.i = 0;
        this.usedBase = false;
        this.usedBitwise = false;
    }

    peek() {
        return this.t[this.i]?.toLowerCase();
    }

    next() {
        return this.t[this.i++];
    }

    expect(tok) {
        if (this.peek() !== tok)
            throw new Error(`expected "${tok}"`);
        this.i++;
    }

    parse() {
        const v = this.bitor();
        if (this.i < this.t.length)
            throw new Error(`unexpected "${this.t[this.i]}"`);
        return v;
    }

    bitor() {
        let v = this.bitxor();
        while (this.peek() === '|') {
            this.next();
            this.usedBitwise = true;
            v = Number(toBig(v) | toBig(this.bitxor()));
        }
        return v;
    }

    bitxor() {
        let v = this.bitand();
        while (this.peek() === 'xor') {
            this.next();
            this.usedBitwise = true;
            v = Number(toBig(v) ^ toBig(this.bitand()));
        }
        return v;
    }

    bitand() {
        let v = this.shift();
        while (this.peek() === '&') {
            this.next();
            this.usedBitwise = true;
            v = Number(toBig(v) & toBig(this.shift()));
        }
        return v;
    }

    shift() {
        let v = this.add();
        while (this.peek() === '<<' || this.peek() === '>>') {
            const op = this.next();
            this.usedBitwise = true;
            const r = toBig(this.add());
            if (r < 0n || r > 1024n)
                throw new Error('shift amount must be 0 to 1024');
            v = Number(op === '<<' ? toBig(v) << r : toBig(v) >> r);
        }
        return v;
    }

    add() {
        let v = this.mul();
        while (this.peek() === '+' || this.peek() === '-') {
            const op = this.next();
            const r = this.mul();
            v = op === '+' ? v + r : v - r;
        }
        return v;
    }

    mul() {
        let v = this.unary();
        for (;;) {
            const p = this.peek();
            if (p === '*' || p === '/' || p === '%' || p === '//' || p === 'mod') {
                this.next();
                const r = this.unary();
                if (p === '*')
                    v *= r;
                else if (p === '/')
                    v /= r;
                else if (p === '//')
                    v = Math.floor(v / r);
                else
                    v = ((v % r) + r) % r;
            } else if (p !== undefined && (p === '(' || /^[a-zπ]/.test(p)) && !['xor', 'mod'].includes(p)) {
                v *= this.unary();
            } else {
                return v;
            }
        }
    }

    unary() {
        const p = this.peek();
        if (p === '-') {
            this.next();
            return -this.unary();
        }
        if (p === '+') {
            this.next();
            return this.unary();
        }
        if (p === '~') {
            this.next();
            this.usedBitwise = true;
            return Number(~toBig(this.unary()));
        }
        return this.power();
    }

    power() {
        const base = this.postfix();
        if (this.peek() === '^' || this.peek() === '**') {
            this.next();
            return base ** this.unary();
        }
        return base;
    }

    postfix() {
        let v = this.primary();
        while (this.peek() === '!') {
            this.next();
            v = factorial(v);
        }
        return v;
    }

    primary() {
        const tok = this.next();
        if (tok === undefined)
            throw new Error('incomplete expression');
        const low = tok.toLowerCase();
        if (low === '(') {
            const v = this.bitor();
            this.expect(')');
            return v;
        }
        if (/^[\d.]/.test(low)) {
            const n = parseNumber(tok);
            if (n.base !== 10)
                this.usedBase = true;
            if (Number.isNaN(n.value))
                throw new Error(`bad number ${tok}`);
            return n.value;
        }
        const isFunction = Object.hasOwn(FUNCS, low);
        if (isFunction && this.peek() !== undefined && this.peek() !== '(' && /^[\d.a-zπ]/.test(this.peek()))
            return FUNCS[low](this.unary());
        if (isFunction && this.peek() === '(') {
            this.next();
            const args = [];
            if (this.peek() !== ')') {
                args.push(this.bitor());
                while (this.peek() === ',') {
                    this.next();
                    args.push(this.bitor());
                }
            }
            this.expect(')');
            return FUNCS[low](...args);
        }
        if (Object.hasOwn(CONSTS, low))
            return CONSTS[low];
        throw new Error(`unknown "${tok}"`);
    }
}

export function evaluate(src) {
    const p = new Parser(tokenize(src));
    const value = p.parse();
    return {value, usedBase: p.usedBase, usedBitwise: p.usedBitwise};
}

export function formatNumber(x) {
    if (!Number.isFinite(x))
        return Number.isNaN(x) ? 'Not a number' : (x > 0 ? '∞' : '-∞');
    if (x !== 0 && (Math.abs(x) >= 1e21 || Math.abs(x) < 1e-9))
        return x.toExponential(10).replace(/\.?0+e/, 'e');
    return String(Number(x.toPrecision(15)));
}

export function formatGrouped(x, digits = 10) {
    if (!Number.isFinite(x) || Math.abs(x) >= 1e21)
        return formatNumber(x);
    return x.toLocaleString('en-US', {maximumFractionDigits: digits});
}

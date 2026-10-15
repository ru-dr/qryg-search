// SPDX-License-Identifier: GPL-3.0-or-later
// No GNOME imports, so it can be tested with node.

export const UNIT_DEFS = {
    length: {
        base: 'm',
        units: {
            mm: [0.001, 'millimeter', 'millimeters', 'millimetre', 'millimetres'],
            cm: [0.01, 'centimeter', 'centimeters', 'centimetre', 'centimetres'],
            m: [1, 'meter', 'meters', 'metre', 'metres'],
            km: [1000, 'kilometer', 'kilometers', 'kilometre', 'kilometres'],
            in: [0.0254, 'inch', 'inches', '"'],
            ft: [0.3048, 'foot', 'feet', "'"],
            yd: [0.9144, 'yard', 'yards'],
            mi: [1609.344, 'mile', 'miles'],
            nmi: [1852, 'nauticalmile', 'nauticalmiles'],
            µm: [1e-6, 'um', 'micrometer', 'micrometers', 'micron', 'microns'],
            nm: [1e-9, 'nanometer', 'nanometers'],
        },
    },
    mass: {
        base: 'kg',
        units: {
            mg: [1e-6, 'milligram', 'milligrams'],
            g: [0.001, 'gram', 'grams'],
            kg: [1, 'kilogram', 'kilograms', 'kilo', 'kilos'],
            t: [1000, 'tonne', 'tonnes', 'ton', 'tons'],
            oz: [0.028349523125, 'ounce', 'ounces'],
            lb: [0.45359237, 'lbs', 'pound', 'pounds'],
            st: [6.35029318, 'stone', 'stones'],
        },
    },
    volume: {
        base: 'l',
        units: {
            ml: [0.001, 'milliliter', 'milliliters', 'millilitre', 'millilitres'],
            cl: [0.01, 'centiliter', 'centiliters'],
            dl: [0.1, 'deciliter', 'deciliters'],
            l: [1, 'liter', 'liters', 'litre', 'litres'],
            m3: [1000, 'm³', 'cubicmeter', 'cubicmeters'],
            gal: [3.785411784, 'gallon', 'gallons'],
            qt: [0.946352946, 'quart', 'quarts'],
            pt: [0.473176473, 'pint', 'pints'],
            cup: [0.2365882365, 'cups'],
            floz: [0.0295735295625, 'fl_oz', 'fluidounce', 'fluidounces'],
            tbsp: [0.01478676478125, 'tablespoon', 'tablespoons'],
            tsp: [0.00492892159375, 'teaspoon', 'teaspoons'],
        },
    },
    area: {
        base: 'm2',
        units: {
            mm2: [1e-6, 'mm²'],
            cm2: [1e-4, 'cm²'],
            m2: [1, 'm²', 'sqm'],
            km2: [1e6, 'km²'],
            ha: [1e4, 'hectare', 'hectares'],
            acre: [4046.8564224, 'acres', 'ac'],
            ft2: [0.09290304, 'ft²', 'sqft'],
            in2: [0.00064516, 'in²', 'sqin'],
            mi2: [2589988.110336, 'mi²', 'sqmi'],
        },
    },
    time: {
        base: 's',
        units: {
            ns: [1e-9, 'nanosecond', 'nanoseconds'],
            µs: [1e-6, 'us', 'microsecond', 'microseconds'],
            ms: [0.001, 'millisecond', 'milliseconds'],
            s: [1, 'sec', 'secs', 'second', 'seconds'],
            min: [60, 'mins', 'minute', 'minutes'],
            h: [3600, 'hr', 'hrs', 'hour', 'hours'],
            d: [86400, 'day', 'days'],
            wk: [604800, 'week', 'weeks'],
            mo: [2629746, 'month', 'months'],
            yr: [31556952, 'year', 'years', 'y'],
        },
    },
    speed: {
        base: 'm/s',
        units: {
            'm/s': [1, 'mps'],
            'km/h': [1 / 3.6, 'kmh', 'kph'],
            mph: [0.44704],
            knot: [0.514444, 'knots', 'kn', 'kt'],
            'ft/s': [0.3048, 'fps'],
        },
    },
    data: {
        base: 'B',
        caseSensitive: true,
        units: {
            bit: [0.125, 'bits', 'b'],
            B: [1, 'byte', 'bytes'],
            KB: [1e3, 'kB', 'kb', 'kilobyte', 'kilobytes'],
            MB: [1e6, 'mb', 'megabyte', 'megabytes'],
            GB: [1e9, 'gb', 'gigabyte', 'gigabytes'],
            TB: [1e12, 'tb', 'terabyte', 'terabytes'],
            PB: [1e15, 'pb', 'petabyte', 'petabytes'],
            KiB: [1024, 'kib', 'kibibyte', 'kibibytes'],
            MiB: [1024 ** 2, 'mib', 'mebibyte', 'mebibytes'],
            GiB: [1024 ** 3, 'gib', 'gibibyte', 'gibibytes'],
            TiB: [1024 ** 4, 'tib', 'tebibyte', 'tebibytes'],
            Kb: [125, 'kbit', 'kilobit', 'kilobits'],
            Mb: [125e3, 'mbit', 'megabit', 'megabits'],
            Gb: [125e6, 'gbit', 'gigabit', 'gigabits'],
        },
    },
    pressure: {
        base: 'Pa',
        units: {
            Pa: [1, 'pa', 'pascal', 'pascals'],
            kPa: [1000, 'kpa'],
            bar: [1e5, 'bars'],
            atm: [101325],
            psi: [6894.757293168],
            mmHg: [133.322387415, 'mmhg', 'torr'],
        },
    },
    energy: {
        base: 'J',
        units: {
            J: [1, 'j', 'joule', 'joules'],
            kJ: [1000, 'kj', 'kilojoule', 'kilojoules'],
            cal: [4.184, 'calorie', 'calories'],
            kcal: [4184, 'kilocalorie', 'kilocalories'],
            Wh: [3600, 'wh'],
            kWh: [3.6e6, 'kwh'],
            eV: [1.602176634e-19, 'ev', 'electronvolt'],
        },
    },
    angle: {
        base: 'rad',
        units: {
            rad: [1, 'radian', 'radians'],
            deg: [Math.PI / 180, '°', 'degree', 'degrees'],
            grad: [Math.PI / 200, 'gradian', 'gradians', 'gon'],
            turn: [2 * Math.PI, 'turns', 'rev', 'revolution'],
        },
    },
    temperature: {
        base: 'K',
        units: {
            C: [null, '°c', 'c', 'celsius', 'degc'],
            F: [null, '°f', 'f', 'fahrenheit', 'degf'],
            K: [null, 'k', 'kelvin', 'kelvins'],
        },
    },
};

const UNITS = new Map();
const UNITS_CI = new Map();
for (const [category, def] of Object.entries(UNIT_DEFS)) {
    for (const [symbol, [factor, ...aliases]] of Object.entries(def.units)) {
        const entry = {category, symbol, factor};
        for (const name of [symbol, ...aliases]) {
            if (def.caseSensitive)
                UNITS.set(name, entry);
            else
                UNITS_CI.set(name.toLowerCase(), entry);
        }
    }
}

export function lookupUnit(name) {
    return UNITS.get(name) ?? UNITS_CI.get(name.toLowerCase()) ?? null;
}

function toKelvin(v, s) {
    return s === 'C' ? v + 273.15 : s === 'F' ? (v - 32) * 5 / 9 + 273.15 : v;
}

function fromKelvin(v, s) {
    return s === 'C' ? v - 273.15 : s === 'F' ? (v - 273.15) * 9 / 5 + 32 : v;
}

export function convertUnits(value, from, to) {
    const a = lookupUnit(from);
    const b = lookupUnit(to);
    if (!a || !b || a.category !== b.category)
        return null;
    const result = a.category === 'temperature'
        ? fromKelvin(toKelvin(value, a.symbol), b.symbol)
        : value * a.factor / b.factor;
    return {value: result, from: a.symbol, to: b.symbol, category: a.category};
}

export const CONVERSION = /^\s*(.+?)\s*([a-zA-Zµ°"'][a-zA-Zµ°²³"'/_0-9]*)\s+(?:to|in|as|into|=|->)\s+([a-zA-Zµ°][a-zA-Zµ°²³/_0-9]*)\s*$/;

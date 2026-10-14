const UNIT_PATTERN = /^(.+?)\s+(?:in|to|into)\s+(.+)$/i;

const TABLES = [
  {
    dim: "length",
    units: {
      m: 1,
      meter: 1,
      meters: 1,
      metre: 1,
      metres: 1,
      km: 1000,
      kilometer: 1000,
      kilometers: 1000,
      kilometre: 1000,
      kilometres: 1000,
      cm: 0.01,
      centimeter: 0.01,
      centimeters: 0.01,
      mm: 0.001,
      millimeter: 0.001,
      millimeters: 0.001,
      mi: 1609.344,
      mile: 1609.344,
      miles: 1609.344,
      yd: 0.9144,
      yard: 0.9144,
      yards: 0.9144,
      ft: 0.3048,
      foot: 0.3048,
      feet: 0.3048,
      in: 0.0254,
      inch: 0.0254,
      inches: 0.0254,
      nmi: 1852,
      nm: 1852,
    },
  },
  {
    dim: "mass",
    units: {
      g: 1,
      gram: 1,
      grams: 1,
      kg: 1000,
      kilogram: 1000,
      kilograms: 1000,
      mg: 0.001,
      milligram: 0.001,
      milligrams: 0.001,
      lb: 453.59237,
      lbs: 453.59237,
      pound: 453.59237,
      pounds: 453.59237,
      oz: 28.349523125,
      ounce: 28.349523125,
      ounces: 28.349523125,
    },
  },
  {
    dim: "volume",
    units: {
      l: 1,
      liter: 1,
      liters: 1,
      litre: 1,
      litres: 1,
      ml: 0.001,
      milliliter: 0.001,
      milliliters: 0.001,
      gal: 3.785411784,
      gallon: 3.785411784,
      gallons: 3.785411784,
      qt: 0.946352946,
      quart: 0.946352946,
      quarts: 0.946352946,
      pt: 0.473176473,
      pint: 0.473176473,
      pints: 0.473176473,
      cup: 0.2365882365,
      cups: 0.2365882365,
      floz: 0.0295735295625,
      tbsp: 0.01478676478125,
      tsp: 0.00492892159375,
    },
  },
  {
    dim: "area",
    units: {
      m2: 1,
      sqm: 1,
      km2: 1e6,
      cm2: 0.0001,
      ft2: 0.09290304,
      sqft: 0.09290304,
      in2: 0.00064516,
      sqin: 0.00064516,
      acre: 4046.8564224,
      acres: 4046.8564224,
      ha: 10000,
      hectare: 10000,
      hectares: 10000,
    },
  },
  {
    dim: "speed",
    units: {
      "m/s": 1,
      mps: 1,
      "km/h": 1000 / 3600,
      kmh: 1000 / 3600,
      kph: 1000 / 3600,
      mph: 0.44704,
      knot: 0.514444,
      knots: 0.514444,
      kn: 0.514444,
    },
  },
  {
    dim: "data",
    units: {
      b: 1,
      byte: 1,
      bytes: 1,
      kb: 1000,
      mb: 1e6,
      gb: 1e9,
      tb: 1e12,
      kib: 1024,
      mib: 1024 ** 2,
      gib: 1024 ** 3,
      tib: 1024 ** 4,
    },
  },
  {
    dim: "time",
    units: {
      ns: 1e-9,
      us: 1e-6,
      ms: 0.001,
      s: 1,
      sec: 1,
      second: 1,
      seconds: 1,
      min: 60,
      minute: 60,
      minutes: 60,
      h: 3600,
      hr: 3600,
      hour: 3600,
      hours: 3600,
      day: 86400,
      days: 86400,
      week: 604800,
      weeks: 604800,
    },
  },
];

const TEMP = {
  c: "c",
  f: "f",
  k: "k",
  celsius: "c",
  fahrenheit: "f",
  kelvin: "k",
};

const SHORT = {
  meter: "m",
  meters: "m",
  metre: "m",
  metres: "m",
  kilometer: "km",
  kilometers: "km",
  kilometre: "km",
  kilometres: "km",
  centimeter: "cm",
  centimeters: "cm",
  millimeter: "mm",
  millimeters: "mm",
  mile: "mi",
  miles: "mi",
  yard: "yd",
  yards: "yd",
  foot: "ft",
  feet: "ft",
  inch: "in",
  inches: "in",
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  milligram: "mg",
  milligrams: "mg",
  pound: "lb",
  pounds: "lb",
  lbs: "lb",
  ounce: "oz",
  ounces: "oz",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  milliliter: "ml",
  milliliters: "ml",
  gallon: "gal",
  gallons: "gal",
  quart: "qt",
  quarts: "qt",
  pint: "pt",
  pints: "pt",
  cups: "cup",
  celsius: "c",
  fahrenheit: "f",
  kelvin: "k",
  second: "s",
  seconds: "s",
  sec: "s",
  minute: "min",
  minutes: "min",
  hour: "h",
  hours: "h",
  hr: "h",
  hectare: "ha",
  hectares: "ha",
  acres: "acre",
  knots: "kn",
  byte: "b",
  bytes: "b",
};

function normUnit(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/°/g, "")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/\s+/g, "");
}

function displayUnit(raw) {
  const key = normUnit(raw);
  return SHORT[key] || key;
}

function lookupLinear(raw) {
  const key = normUnit(raw);
  for (const table of TABLES) {
    if (Object.prototype.hasOwnProperty.call(table.units, key)) {
      return { dim: table.dim, factor: table.units[key], key };
    }
  }
  return null;
}

function parseQuantity(text) {
  const match = String(text || "")
    .trim()
    .match(/^(-?\d[\d,]*(?:\.\d+)?(?:e[+-]?\d+)?)\s*(.+)$/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  return { value, unit: match[2].trim() };
}

function fromCelsius(value, unit) {
  if (unit === "c") return value;
  if (unit === "f") return (value * 9) / 5 + 32;
  return value + 273.15;
}

function toCelsius(value, unit) {
  if (unit === "c") return value;
  if (unit === "f") return ((value - 32) * 5) / 9;
  return value - 273.15;
}

function formatQuantity(value) {
  if (!Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  const text = String(Number(value.toFixed(digits)));
  return text === "-0" ? "0" : text;
}

export function convertExpression(input) {
  const match = String(input || "").trim().match(UNIT_PATTERN);
  if (!match) return null;
  const left = parseQuantity(match[1]);
  if (!left) return null;
  const fromTemp = TEMP[normUnit(left.unit)];
  const toTemp = TEMP[normUnit(match[2])];
  if (fromTemp || toTemp) {
    if (!fromTemp || !toTemp) return null;
    const value = fromCelsius(toCelsius(left.value, fromTemp), toTemp);
    const formatted = formatQuantity(value);
    if (formatted == null) return null;
    return `${formatted} ${displayUnit(match[2])}`;
  }

  const from = lookupLinear(left.unit);
  const to = lookupLinear(match[2]);
  if (!from || !to || from.dim !== to.dim) return null;
  const value = (left.value * from.factor) / to.factor;
  const formatted = formatQuantity(value);
  if (formatted == null) return null;
  return `${formatted} ${displayUnit(match[2])}`;
}

export function unitResult(query) {
  const text = String(query || "").trim();
  const value = convertExpression(text);
  if (value == null) return null;
  return {
    id: "units",
    title: value,
    subtitle: "Copy conversion",
    category: "Units",
    score: 2000,
    direct: true,
    action: { type: "copy", text: value },
  };
}

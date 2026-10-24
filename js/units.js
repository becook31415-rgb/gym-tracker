// Weight units and load-basis helpers. Pure functions, no DOM.
// Stored weights are never rewritten: these only convert for display/comparison.

export const KG_PER_LB = 0.45359237;
export const UNITS = ['kg', 'lb'];
// 'assist' = assistance given by a machine (e.g. pull-up assist): lower is better.
export const LOAD_BASES = ['total', 'per_hand', 'per_side', 'added', 'assist'];

// Parse a number typed by the user. Accepts "102.5" and "102,5". Blank -> null.
export function parseNum(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseIntOrNull(value) {
  const n = parseNum(value);
  return n === null ? null : Math.round(n);
}

export function toKg(weight, unit) {
  if (weight === null || weight === undefined) return null;
  return unit === 'lb' ? weight * KG_PER_LB : weight;
}

export function convert(weight, from, to) {
  if (weight === null || weight === undefined) return null;
  if (from === to || !from || !to) return weight;
  return from === 'kg' ? weight / KG_PER_LB : weight * KG_PER_LB;
}

export function roundTo(x, step) {
  if (x === null || x === undefined) return null;
  return Math.round(x / step) * step;
}

// Number for display in the chosen unit: exact if same unit, else rounded to 0.1.
export function displayNumber(weight, unit, displayUnit) {
  if (weight === null || weight === undefined) return null;
  const v = convert(weight, unit, displayUnit);
  return unit === displayUnit ? v : Math.round(v * 10) / 10;
}

// Value used to pre-fill an input from an older set: converted, rounded to 0.5.
export function prefillNumber(weight, unit, displayUnit) {
  if (weight === null || weight === undefined) return null;
  return unit === displayUnit ? weight : roundTo(convert(weight, unit, displayUnit), 0.5);
}

export function fmt(n) {
  if (n === null || n === undefined) return '';
  return String(Math.round(n * 100) / 100);
}

// Label shown beside the weight input, e.g. "kg per hand".
export function loadBasisLabel(loadBasis, unit) {
  switch (loadBasis) {
    case 'per_hand': return `${unit} per hand`;
    case 'per_side': return `${unit} per side`;
    case 'added': return `${unit} added`;
    case 'assist': return `${unit} assist`;
    default: return unit;
  }
}

// Blank/0 weight means "bodyweight only". Not for 'assist', where the number is the assistance.
export function isBodyweightExercise(ex) {
  if (ex.load_basis === 'assist') return false;
  return ex.type === 'bodyweight' || ex.load_basis === 'added';
}

// Short text for one weight, e.g. "110kg", "BW", "BW+6kg", "60lb assist".
export function weightText(weight, unit, displayUnit, ex) {
  const bw = isBodyweightExercise(ex);
  if (weight === null || weight === undefined || (bw && weight === 0)) return bw ? 'BW' : '–';
  const n = fmt(displayNumber(weight, unit, displayUnit));
  if (bw) return `BW+${n}${displayUnit}`;
  if (ex.load_basis === 'assist') return weight === 0 ? 'no assist' : `${n}${displayUnit} assist`;
  return `${n}${displayUnit}`;
}

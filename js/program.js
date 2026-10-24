// Program file validation and CSV -> JSON conversion. Pure functions, no DOM.
// Validation is strict and all-or-nothing: any error means nothing is imported.

import { parseCSV } from './csv.js';

const TOP_KEYS = ['schema_version', 'program_name', 'start_date', 'duration_weeks', 'units', 'program_notes', 'weeks'];
const WEEK_KEYS = ['week', 'days'];
const DAY_KEYS = ['day_name', 'scheduled_date', 'exercises'];
const EX_KEYS = ['order', 'exercise_id', 'name', 'alternatives', 'type', 'group', 'sets', 'sets_note', 'reps',
  'target_weight', 'rpe', 'per_side', 'load_basis', 'prescription_note', 'cues', 'progression', 'notes',
  'superset_group', 'cardio'];
const CARDIO_KEYS = ['cardio_type', 'duration_min', 'intensity'];
const TYPES = ['strength', 'bodyweight', 'cardio'];
const LOAD_BASES = ['total', 'per_hand', 'per_side', 'added', 'assist'];
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ERRORS = 40;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStrOrNull = (v) => v === null || v === undefined || typeof v === 'string';
const isNumOrNull = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isFinite(v));
const q = (s) => `"${s}"`;

function validDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function unknownKeys(obj, allowed, where, errors) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) errors.push(`${where}: unknown field ${q(k)} (check the spelling against the schema)`);
  }
}

/**
 * @returns {{ok:true, program:object, errors:[]} | {ok:false, errors:string[]}}
 */
export function validateProgram(input) {
  const errors = [];
  if (!isObj(input)) return { ok: false, errors: ['The file must contain one JSON object { ... } at the top level.'] };

  unknownKeys(input, TOP_KEYS, 'Program', errors);
  if (input.schema_version === undefined) errors.push('Program: "schema_version" is required (use 1).');
  else if (input.schema_version !== 1) errors.push(`Program: "schema_version" must be 1 (got ${JSON.stringify(input.schema_version)}).`);
  if (typeof input.program_name !== 'string' || !input.program_name.trim()) errors.push('Program: "program_name" is required and must be text.');
  if (input.start_date != null && (typeof input.start_date !== 'string' || !validDate(input.start_date)))
    errors.push('Program: "start_date" must be a date like "2026-09-14", or null.');
  if (input.duration_weeks != null && !(Number.isInteger(input.duration_weeks) && input.duration_weeks > 0))
    errors.push('Program: "duration_weeks" must be a whole number, or null.');
  if (input.units != null && !['kg', 'lb'].includes(input.units)) errors.push('Program: "units" must be "kg" or "lb".');

  if (input.program_notes != null) {
    if (!Array.isArray(input.program_notes)) errors.push('Program: "program_notes" must be a list [ ... ].');
    else input.program_notes.forEach((n, i) => {
      const w = `Program note ${i + 1}`;
      if (!isObj(n)) { errors.push(`${w}: must be an object with "title" and "body".`); return; }
      unknownKeys(n, ['title', 'body'], w, errors);
      if (typeof n.title !== 'string') errors.push(`${w}: "title" must be text.`);
      if (typeof n.body !== 'string') errors.push(`${w}: "body" must be text.`);
    });
  }

  if (!Array.isArray(input.weeks) || input.weeks.length === 0) {
    errors.push('Program: "weeks" is required and must be a non-empty list [ ... ].');
    return finish(errors, input);
  }

  const weekNums = new Set();
  input.weeks.forEach((wk, wi) => {
    let wWhere = `Week entry ${wi + 1}`;
    if (!isObj(wk)) { errors.push(`${wWhere}: must be an object.`); return; }
    if (!Number.isInteger(wk.week) || wk.week < 1) errors.push(`${wWhere}: "week" is required and must be a whole number.`);
    else {
      wWhere = `Week ${wk.week}`;
      if (weekNums.has(wk.week)) errors.push(`${wWhere}: this week number appears more than once.`);
      weekNums.add(wk.week);
    }
    unknownKeys(wk, WEEK_KEYS, wWhere, errors);
    if (!Array.isArray(wk.days) || wk.days.length === 0) { errors.push(`${wWhere}: "days" is required and must be a non-empty list.`); return; }

    const dayNames = new Set();
    wk.days.forEach((day, di) => {
      const dWhere = `${wWhere}, Day ${di + 1}`;
      if (!isObj(day)) { errors.push(`${dWhere}: must be an object.`); return; }
      unknownKeys(day, DAY_KEYS, dWhere, errors);
      if (typeof day.day_name !== 'string' || !day.day_name.trim()) errors.push(`${dWhere}: "day_name" is required and must be text.`);
      else {
        if (dayNames.has(day.day_name)) errors.push(`${dWhere}: day_name ${q(day.day_name)} is used twice in this week.`);
        dayNames.add(day.day_name);
      }
      if (day.scheduled_date != null && (typeof day.scheduled_date !== 'string' || !validDate(day.scheduled_date)))
        errors.push(`${dWhere}: "scheduled_date" must be a date like "2026-09-28", or null.`);
      if (!Array.isArray(day.exercises) || day.exercises.length === 0) { errors.push(`${dWhere}: "exercises" is required and must be a non-empty list.`); return; }

      const ids = new Set();
      const orders = new Set();
      day.exercises.forEach((ex, ei) => validateExercise(ex, `${dWhere}, exercise ${ei + 1}`, ids, orders, errors));
    });
  });

  return finish(errors, input);
}

function validateExercise(ex, where, ids, orders, errors) {
  if (!isObj(ex)) { errors.push(`${where}: must be an object.`); return; }
  if (typeof ex.name === 'string' && ex.name.trim()) where += ` (${q(ex.name)})`;
  unknownKeys(ex, EX_KEYS, where, errors);

  if (typeof ex.order !== 'number' || !Number.isFinite(ex.order)) errors.push(`${where}: "order" is required and must be a number.`);
  else { if (orders.has(ex.order)) errors.push(`${where}: "order" ${ex.order} is used twice in this day.`); orders.add(ex.order); }

  if (typeof ex.exercise_id !== 'string' || !ex.exercise_id) errors.push(`${where}: "exercise_id" is required.`);
  else if (!ID_RE.test(ex.exercise_id)) errors.push(`${where}: "exercise_id" ${q(ex.exercise_id)} must be lowercase-kebab, e.g. "back-squat".`);
  else { if (ids.has(ex.exercise_id)) errors.push(`${where}: exercise_id ${q(ex.exercise_id)} appears twice in this day.`); ids.add(ex.exercise_id); }

  if (typeof ex.name !== 'string' || !ex.name.trim()) errors.push(`${where}: "name" is required and must be text.`);
  if (ex.alternatives != null && (!Array.isArray(ex.alternatives) || !ex.alternatives.every((a) => typeof a === 'string' && a.trim())))
    errors.push(`${where}: "alternatives" must be a list of names, e.g. ["Safety-bar squat"], or null.`);
  if (ex.type != null && !TYPES.includes(ex.type)) errors.push(`${where}: "type" must be "strength", "bodyweight" or "cardio".`);
  if (ex.sets != null && !(Number.isInteger(ex.sets) && ex.sets >= 1 && ex.sets <= 20)) errors.push(`${where}: "sets" must be a number (a whole number from 1 to 20), or null.`);
  if (ex.reps != null && typeof ex.reps !== 'string') errors.push(`${where}: "reps" must be text in quotes, e.g. "3-5" (got ${JSON.stringify(ex.reps)}).`);
  if (!isNumOrNull(ex.target_weight)) errors.push(`${where}: "target_weight" must be a number or null.`);
  if (ex.rpe != null && typeof ex.rpe !== 'string' && !(typeof ex.rpe === 'number' && Number.isFinite(ex.rpe))) errors.push(`${where}: "rpe" must be text, a number or null.`);
  if (ex.per_side != null && typeof ex.per_side !== 'boolean') errors.push(`${where}: "per_side" must be true or false.`);
  if (ex.load_basis != null && !LOAD_BASES.includes(ex.load_basis)) errors.push(`${where}: "load_basis" must be one of "total", "per_hand", "per_side", "added", "assist".`);
  for (const k of ['group', 'sets_note', 'prescription_note', 'cues', 'progression', 'notes', 'superset_group']) {
    if (!isStrOrNull(ex[k])) errors.push(`${where}: ${q(k)} must be text or null.`);
  }
  if (ex.cardio != null) {
    if (!isObj(ex.cardio)) errors.push(`${where}: "cardio" must be an object or null.`);
    else {
      unknownKeys(ex.cardio, CARDIO_KEYS, `${where} cardio`, errors);
      if (!isStrOrNull(ex.cardio.cardio_type)) errors.push(`${where}: "cardio.cardio_type" must be text.`);
      if (!isNumOrNull(ex.cardio.duration_min)) errors.push(`${where}: "cardio.duration_min" must be a number.`);
      if (ex.cardio.intensity != null && typeof ex.cardio.intensity !== 'string' && typeof ex.cardio.intensity !== 'number')
        errors.push(`${where}: "cardio.intensity" must be text or a number.`);
    }
  }
}

function finish(errors, input) {
  if (errors.length) {
    const shown = errors.slice(0, MAX_ERRORS);
    if (errors.length > MAX_ERRORS) shown.push(`…and ${errors.length - MAX_ERRORS} more problems.`);
    return { ok: false, errors: shown };
  }
  return { ok: true, errors: [], program: normalise(input) };
}

const nn = (v) => (v === undefined ? null : v);

function normalise(p) {
  return {
    schema_version: 1,
    program_name: p.program_name.trim(),
    start_date: nn(p.start_date),
    duration_weeks: nn(p.duration_weeks),
    units: p.units || 'kg',
    program_notes: (p.program_notes || []).map((n) => ({ title: n.title, body: n.body })),
    weeks: [...p.weeks].sort((a, b) => a.week - b.week).map((w) => ({
      week: w.week,
      days: w.days.map((d) => ({
        day_name: d.day_name,
        scheduled_date: nn(d.scheduled_date),
        exercises: [...d.exercises].sort((a, b) => a.order - b.order).map((e) => ({
          order: e.order,
          exercise_id: e.exercise_id,
          name: e.name.trim(),
          alternatives: e.alternatives || [],
          type: e.type || 'strength',
          group: nn(e.group) || null,
          sets: nn(e.sets),
          sets_note: nn(e.sets_note),
          reps: nn(e.reps),
          target_weight: nn(e.target_weight),
          rpe: e.rpe === undefined || e.rpe === null ? null : String(e.rpe),
          per_side: e.per_side === true,
          load_basis: e.load_basis || 'total',
          prescription_note: nn(e.prescription_note),
          cues: nn(e.cues),
          progression: nn(e.progression),
          notes: nn(e.notes),
          superset_group: nn(e.superset_group),
          cardio: e.cardio ? { cardio_type: nn(e.cardio.cardio_type), duration_min: nn(e.cardio.duration_min), intensity: nn(e.cardio.intensity) } : null,
        })),
      })),
    })),
  };
}

// ---------------- CSV fallback ----------------

export const CSV_COLUMNS = ['week', 'day_name', 'scheduled_date', 'order', 'group', 'exercise_id', 'name', 'alternatives',
  'type', 'sets', 'sets_note', 'reps', 'rpe', 'per_side', 'load_basis', 'prescription_note', 'cues', 'progression', 'notes'];
const CSV_OPTIONAL = ['program_name', 'units', 'target_weight', 'superset_group', 'cardio_type', 'duration_min', 'intensity'];
const CSV_REQUIRED = ['week', 'day_name', 'order', 'exercise_id', 'name'];

/**
 * Convert a program CSV (one row per exercise) into program JSON, then validate it.
 * @returns same shape as validateProgram
 */
export function csvToProgram(text, fallbackName = 'Imported program') {
  const rows = parseCSV(text);
  if (rows.length < 2) return { ok: false, errors: ['The CSV needs a header row and at least one exercise row.'] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const errors = [];
  for (const h of header) {
    if (h && !CSV_COLUMNS.includes(h) && !CSV_OPTIONAL.includes(h)) errors.push(`Header: unknown column ${q(h)}.`);
  }
  for (const r of CSV_REQUIRED) if (!header.includes(r)) errors.push(`Header: required column ${q(r)} is missing.`);
  if (errors.length) return { ok: false, errors };

  const weeks = new Map();
  let programName = null;
  let units = null;

  rows.slice(1).forEach((cells, i) => {
    const where = `Row ${i + 2}`;
    const get = (col) => {
      const idx = header.indexOf(col);
      if (idx < 0) return null;
      const v = (cells[idx] ?? '').trim();
      return v === '' ? null : v;
    };
    const num = (col, integer) => {
      const v = get(col);
      if (v === null) return null;
      const n = Number(v.replace(',', '.'));
      if (!Number.isFinite(n) || (integer && !Number.isInteger(n))) {
        errors.push(`${where}: ${q(col)} must be a number (got ${q(v)}).`);
        return null;
      }
      return n;
    };

    if (!programName && get('program_name')) programName = get('program_name');
    if (!units && get('units')) units = get('units');

    const week = num('week', true);
    const dayName = get('day_name');
    if (week === null) { errors.push(`${where}: "week" is required.`); return; }
    if (!dayName) { errors.push(`${where}: "day_name" is required.`); return; }

    let perSide = null;
    const ps = get('per_side');
    if (ps !== null) {
      const l = ps.toLowerCase();
      if (['true', 'yes', 'y', '1'].includes(l)) perSide = true;
      else if (['false', 'no', 'n', '0'].includes(l)) perSide = false;
      else errors.push(`${where}: "per_side" must be true or false (got ${q(ps)}).`);
    }

    if (!weeks.has(week)) weeks.set(week, new Map());
    const days = weeks.get(week);
    if (!days.has(dayName)) days.set(dayName, { day_name: dayName, scheduled_date: null, exercises: [] });
    const day = days.get(dayName);
    const sd = get('scheduled_date');
    if (sd) {
      if (day.scheduled_date && day.scheduled_date !== sd) errors.push(`${where}: scheduled_date ${q(sd)} differs from an earlier row for the same day (${q(day.scheduled_date)}).`);
      day.scheduled_date = sd;
    }

    const type = get('type') || 'strength';
    const alts = get('alternatives');
    const ex = {
      order: num('order', false),
      exercise_id: get('exercise_id'),
      name: get('name'),
      alternatives: alts ? alts.split('|').map((s) => s.trim()).filter(Boolean) : [],
      type,
      group: get('group'),
      sets: num('sets', true),
      sets_note: get('sets_note'),
      reps: get('reps'),
      target_weight: num('target_weight', false),
      rpe: get('rpe'),
      per_side: perSide === true,
      load_basis: get('load_basis') || 'total',
      prescription_note: get('prescription_note'),
      cues: get('cues'),
      progression: get('progression'),
      notes: get('notes'),
      superset_group: get('superset_group'),
      cardio: null,
    };
    if (type === 'cardio') {
      ex.cardio = { cardio_type: get('cardio_type'), duration_min: num('duration_min', false), intensity: get('intensity') };
    }
    if (ex.order === null && !errors.some((e) => e.startsWith(where))) errors.push(`${where}: "order" is required.`);
    day.exercises.push(ex);
  });

  if (errors.length) return { ok: false, errors: errors.slice(0, MAX_ERRORS) };

  const program = {
    schema_version: 1,
    program_name: programName || fallbackName,
    units: units || 'kg',
    weeks: [...weeks.entries()].map(([week, days]) => ({ week, days: [...days.values()] })),
  };
  return validateProgram(program);
}

// Accept pasted/loaded text: JSON (optionally inside ``` fences copied from an AI chat) or CSV.
export function parseProgramText(text, filename = '') {
  let t = (text || '').trim();
  if (!t) return { ok: false, errors: ['Nothing to import: the file or text box is empty.'] };
  const fence = t.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n```\s*$/);
  if (fence) t = fence[1].trim();
  const looksJson = t.startsWith('{') || t.startsWith('[') || /\.json$/i.test(filename);
  if (looksJson) {
    let obj;
    try { obj = JSON.parse(t); }
    catch (e) { return { ok: false, errors: [`This isn't valid JSON: ${e.message}`] }; }
    return validateProgram(obj);
  }
  const name = filename.replace(/\.[^.]+$/, '') || 'Imported program';
  return csvToProgram(t, name);
}

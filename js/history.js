// Looking back at logged sessions: "last time" text, pre-fill values, prior sets for PBs,
// and which week to open next. Pure functions, no DOM.
//
// History is matched by *variant*: exercise_id + name_performed + load_basis + unit.
// So a safety-bar squat never compares with a back squat, and a machine logged in lb
// never compares with one logged in kg.

import { prefillNumber, weightText, isBodyweightExercise } from './units.js';

export const sessionKey = (s) => `${s.date || ''}|${s.start_time || ''}`;

export function sortSessions(sessions) {
  return [...sessions].sort((a, b) => (sessionKey(a) < sessionKey(b) ? -1 : sessionKey(a) > sessionKey(b) ? 1 : 0));
}

// Sessions without a kind (e.g. hand-made files) are workouts unless they look like cardio.
export const kindOf = (s) => s.kind || (s.cardio_type !== undefined && !s.exercises ? 'cardio' : 'workout');

// Unit of a logged exercise: its own "unit" overrides the session's.
export const exUnit = (ex, session) => ex.unit || session.unit || 'kg';
// Unit of one logged set: set -> exercise -> session.
export const setUnit = (st, ex, session) => st.unit || exUnit(ex, session);

/** @returns {{exercise_id, name_performed, load_basis, unit}} */
export function variantOf(ex, session) {
  return { exercise_id: ex.exercise_id, name_performed: ex.name_performed, load_basis: ex.load_basis || 'total', unit: exUnit(ex, session) };
}

export function sameVariant(a, b) {
  return a.exercise_id === b.exercise_id && a.name_performed === b.name_performed && a.load_basis === b.load_basis && a.unit === b.unit;
}

// A logged day counts as finished when it has an end time, or when it was imported
// from a file without times (it was logged elsewhere, so there is nothing still "in progress").
export const isFinished = (s) => !!s.end_time || !s.start_time;

// Workout sessions logged before `current` (by date, then start time), oldest first.
export function sessionsBefore(sessions, current) {
  const key = sessionKey(current);
  return sortSessions(sessions.filter((s) => kindOf(s) === 'workout' && s.session_id !== current.session_id && sessionKey(s) < key));
}

const hasAnyData = (ex) => ex.sets && ex.sets.some((s) => s.completed);

/**
 * Most recent earlier performance of this variant, plus whether the exercise (any variant)
 * was skipped the last time it appeared.
 * @returns {{last: {session, ex}|null, skippedLastTime: boolean, skippedDate: string|null}}
 */
export function lastPerformance(sessions, variant, current) {
  const before = sessionsBefore(sessions, current);
  let last = null;
  let skippedLastTime = false;
  let skippedDate = null;
  let first = true;
  for (let i = before.length - 1; i >= 0; i--) {
    const s = before[i];
    const ex = (s.exercises || []).find((e) => e.exercise_id === variant.exercise_id);
    if (!ex) continue;
    if (first && ex.skipped) { skippedLastTime = true; skippedDate = s.date; }
    first = false;
    if (!last && !ex.skipped && hasAnyData(ex) && sameVariant(variantOf(ex, s), variant)) last = { session: s, ex };
    if (last) break;
  }
  return { last, skippedLastTime, skippedDate };
}

/**
 * The variant to use for an exercise not yet touched in this session: whatever you did
 * the last time you did this exercise_id (name, load basis, unit), else the program's.
 */
export function defaultVariant(sessions, progEx, current, fallbackUnit) {
  const before = sessionsBefore(sessions, current);
  for (let i = before.length - 1; i >= 0; i--) {
    const ex = (before[i].exercises || []).find((e) => e.exercise_id === progEx.exercise_id);
    if (ex && !ex.skipped && hasAnyData(ex)) return variantOf(ex, before[i]);
  }
  return { exercise_id: progEx.exercise_id, name_performed: progEx.name, load_basis: progEx.load_basis || 'total', unit: fallbackUnit || 'kg' };
}

// Most recent setup (load basis + unit) used with a given name, or null.
export function lastSetupForName(sessions, exerciseId, name, current) {
  const before = sessionsBefore(sessions, current);
  for (let i = before.length - 1; i >= 0; i--) {
    const ex = (before[i].exercises || []).find((e) => e.exercise_id === exerciseId && e.name_performed === name);
    if (ex && !ex.skipped && hasAnyData(ex)) return { load_basis: ex.load_basis || 'total', unit: exUnit(ex, before[i]) };
  }
  return null;
}

// Every name you have logged for this exercise_id (to offer in the "Doing:" selector).
export function namesUsed(sessions, exerciseId) {
  const names = [];
  for (const s of sortSessions(sessions)) {
    for (const ex of s.exercises || []) {
      if (ex.exercise_id === exerciseId && ex.name_performed && !names.includes(ex.name_performed)) names.push(ex.name_performed);
    }
  }
  return names;
}

// All confirmed sets of this variant before `current`, oldest first (for PB checks).
export function priorSets(sessions, variant, current) {
  const out = [];
  for (const s of sessionsBefore(sessions, current)) {
    for (const ex of s.exercises || []) {
      if (ex.skipped || !sameVariant(variantOf(ex, s), variant)) continue;
      const sets = [...(ex.sets || [])].sort((a, b) => a.set_number - b.set_number);
      for (const st of sets) out.push({ ...st, unit: setUnit(st, ex, s) });
    }
  }
  return out;
}

// "3-5" -> 5, "12-15" -> 15, "5" -> 5, "10/side" -> 10, "30s hold" -> null, "max" -> null
export function topOfRange(reps) {
  if (reps === null || reps === undefined) return null;
  const m = String(reps).match(/^\s*(\d+)\s*(?:(?:-|–|to)\s*(\d+))?\s*(s\b|sec|second)?/i);
  if (!m || m[3]) return null;
  return Number(m[2] || m[1]);
}

/**
 * Values to pre-fill set `index` (0-based). In order of preference:
 * the same set number last time; else the last set you did last time (when the program
 * now asks for more sets than you did); else the program's target weight and top of rep range.
 */
export function prefillSet(index, lastEx, lastSession, programEx, programUnit, displayUnit) {
  const done = lastEx ? [...lastEx.sets].filter((s) => s.completed).sort((a, b) => a.set_number - b.set_number) : [];
  const prev = done[index] || done[done.length - 1] || null;
  let weight = null;
  let reps = null;
  if (prev) {
    weight = prefillNumber(prev.weight, setUnit(prev, lastEx, lastSession), displayUnit);
    reps = prev.reps;
  }
  if (weight === null && programEx.target_weight !== null && programEx.target_weight !== undefined) {
    weight = prefillNumber(programEx.target_weight, programUnit || 'kg', displayUnit);
  }
  if (reps === null) reps = topOfRange(programEx.reps);
  return { weight, reps };
}

// "110kg x 3, 5, 3, 5" or "BW x 4, BW+6kg x 4" or "60lb assist x 3, 3"
export function formatSets(ex, session, displayUnit) {
  const sets = [...(ex.sets || [])].filter((s) => s.completed).sort((a, b) => a.set_number - b.set_number);
  if (!sets.length) return '';
  const meta = { type: ex.type, load_basis: ex.load_basis };
  const items = sets.map((s) => ({ w: weightText(s.weight, setUnit(s, ex, session), displayUnit, meta), r: s.reps ?? '–' }));
  if (items.every((it) => it.r === '–' && (it.w === '–' || it.w === 'BW'))) return 'done (no numbers)';
  if (items.every((it) => it.w === items[0].w)) return `${items[0].w} x ${items.map((it) => it.r).join(', ')}`;
  return items.map((it) => `${it.w} x ${it.r}`).join(', ');
}

/**
 * The week to open after an import/restore: the first program week after the latest week
 * you have logged for this program. No history -> the first week. All logged -> the last week.
 */
export function nextUnloggedWeek(program, sessions) {
  const weeks = program.weeks.map((w) => w.week);
  const logged = sessions.filter((s) => kindOf(s) === 'workout' && s.program_name === program.program_name && weeks.includes(s.week)).map((s) => s.week);
  if (!logged.length) return weeks[0];
  const latest = Math.max(...logged);
  return weeks.find((w) => w > latest) ?? weeks[weeks.length - 1];
}

export { isBodyweightExercise };

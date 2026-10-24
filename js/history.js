// Looking back at logged sessions: "last time" text, pre-fill values and prior sets for PBs.
// Pure functions, no DOM.

import { prefillNumber, weightText, isBodyweightExercise } from './units.js';

export const sessionKey = (s) => `${s.date || ''}|${s.start_time || ''}`;

export function sortSessions(sessions) {
  return [...sessions].sort((a, b) => (sessionKey(a) < sessionKey(b) ? -1 : sessionKey(a) > sessionKey(b) ? 1 : 0));
}

// Workout sessions logged before `current` (by date, then start time), oldest first.
export function sessionsBefore(sessions, current) {
  const key = sessionKey(current);
  return sortSessions(sessions.filter((s) => s.kind === 'workout' && s.session_id !== current.session_id && sessionKey(s) < key));
}

const hasAnyData = (ex) => ex.sets && ex.sets.some((s) => s.completed);

/**
 * Most recent earlier performance of an exercise.
 * @returns {{last: {session, ex}|null, skippedLastTime: boolean, skippedDate: string|null}}
 */
export function lastPerformance(sessions, exerciseId, current) {
  const before = sessionsBefore(sessions, current);
  let last = null;
  let skippedLastTime = false;
  let skippedDate = null;
  let first = true;
  for (let i = before.length - 1; i >= 0; i--) {
    const ex = (before[i].exercises || []).find((e) => e.exercise_id === exerciseId);
    if (!ex) continue;
    if (first && ex.skipped) { skippedLastTime = true; skippedDate = before[i].date; }
    if (!ex.skipped && hasAnyData(ex)) { last = { session: before[i], ex }; break; }
    first = false;
  }
  return { last, skippedLastTime, skippedDate };
}

// All confirmed sets of this exercise + load basis before `current`, oldest first (for PB checks).
export function priorSets(sessions, exerciseId, loadBasis, current) {
  const out = [];
  for (const s of sessionsBefore(sessions, current)) {
    for (const ex of s.exercises || []) {
      if (ex.exercise_id !== exerciseId || ex.skipped || (ex.load_basis || 'total') !== loadBasis) continue;
      const sets = [...(ex.sets || [])].sort((a, b) => a.set_number - b.set_number);
      for (const st of sets) out.push({ ...st, unit: st.unit || s.unit });
    }
  }
  return out;
}

// "3-5" -> 5, "12-15" -> 15, "5" -> 5, "10/side" -> 10, "30s hold" -> null
export function topOfRange(reps) {
  if (reps === null || reps === undefined) return null;
  const m = String(reps).match(/^\s*(\d+)\s*(?:(?:-|–|to)\s*(\d+))?\s*(s\b|sec|second)?/i);
  if (!m || m[3]) return null;
  return Number(m[2] || m[1]);
}

/**
 * Values to pre-fill set `index` (0-based): same set number last time, else program target.
 */
export function prefillSet(index, lastEx, lastSession, programEx, programUnit, displayUnit) {
  const prev = lastEx ? [...lastEx.sets].filter((s) => s.completed).sort((a, b) => a.set_number - b.set_number)[index] : null;
  let weight = null;
  let reps = null;
  if (prev) {
    weight = prefillNumber(prev.weight, prev.unit || lastSession.unit, displayUnit);
    reps = prev.reps;
  }
  if (weight === null && programEx.target_weight !== null && programEx.target_weight !== undefined) {
    weight = prefillNumber(programEx.target_weight, programUnit || 'kg', displayUnit);
  }
  if (reps === null) reps = topOfRange(programEx.reps);
  return { weight, reps };
}

// "110kg x 3, 5, 3, 5" or "BW x 4, BW+6kg x 4"
export function formatSets(ex, sessionUnit, displayUnit) {
  const sets = [...(ex.sets || [])].filter((s) => s.completed).sort((a, b) => a.set_number - b.set_number);
  if (!sets.length) return '';
  const meta = { type: ex.type, load_basis: ex.load_basis };
  const items = sets.map((s) => ({ w: weightText(s.weight, s.unit || sessionUnit, displayUnit, meta), r: s.reps ?? '–' }));
  if (items.every((it) => it.r === '–' && (it.w === '–' || it.w === 'BW'))) return 'done (no numbers)';
  if (items.every((it) => it.w === items[0].w)) return `${items[0].w} x ${items.map((it) => it.r).join(', ')}`;
  return items.map((it) => `${it.w} x ${it.r}`).join(', ');
}

export { isBodyweightExercise };

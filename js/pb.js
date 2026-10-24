// Personal-best detection. Pure function, no DOM.
//
// Rules (per exercise variant, only confirmed sets count):
//  (a) heavier than any previous set with at least 1 rep, or
//  (b) equal to the previous best weight with more reps than ever done at it.
//  Bodyweight exercises with no added weight (blank or 0): highest reps in one set.
//  Assisted exercises (load_basis "assist"): less assistance is better, so the comparison flips.
//  Callers pass only sets of the same variant (exercise_id + name_performed + load_basis + unit).
// Sets with blank reps, or blank weight on a weighted exercise, are ignored.
// The very first logged set is not a PB: there is nothing to beat yet.

import { toKg } from './units.js';

const EPS = 1e-6;

/**
 * @param {Array<{weight:number|null, reps:number|null, unit:string, completed:boolean}>} prior
 *        confirmed sets from earlier sessions (and earlier sets), oldest first
 * @param {Array} current sets to check, in set order
 * @param {{bodyweight?:boolean, lowerIsBetter?:boolean}} opts
 * @returns {boolean[]} one flag per current set
 */
export function pbFlags(prior, current, { bodyweight = false, lowerIsBetter = false } = {}) {
  const state = { hasW: false, maxW: 0, repsAtMax: 0, hasBw: false, maxBwReps: 0 };
  for (const s of prior) step(state, s, bodyweight, lowerIsBetter);
  return current.map((s) => step(state, s, bodyweight, lowerIsBetter));
}

function step(st, s, bodyweight, lowerIsBetter) {
  if (!s || !s.completed) return false;
  const reps = s.reps;
  if (reps === null || reps === undefined || reps < 1) return false;
  let w = s.weight;
  if (w === null || w === undefined) {
    if (!bodyweight) return false;
    w = 0;
  }
  if (bodyweight && w === 0) {
    const isPb = st.hasBw && reps > st.maxBwReps;
    if (!st.hasBw || reps > st.maxBwReps) st.maxBwReps = reps;
    st.hasBw = true;
    return isPb;
  }
  const kg = lowerIsBetter ? -toKg(w, s.unit) : toKg(w, s.unit);
  let isPb = false;
  if (st.hasW) {
    if (kg > st.maxW + EPS) isPb = true;
    else if (Math.abs(kg - st.maxW) <= EPS && reps > st.repsAtMax) isPb = true;
  }
  if (!st.hasW || kg > st.maxW + EPS) {
    st.maxW = kg;
    st.repsAtMax = reps;
  } else if (Math.abs(kg - st.maxW) <= EPS && reps > st.repsAtMax) {
    st.repsAtMax = reps;
  }
  st.hasW = true;
  return isPb;
}

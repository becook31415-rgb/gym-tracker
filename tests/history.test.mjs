import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topOfRange, lastPerformance, prefillSet, formatSets, priorSets } from '../js/history.js';

const set = (n, weight, reps, extra = {}) => ({ set_number: n, weight, reps, rpe: null, set_note: null, completed: true, unit: 'kg', ...extra });
const session = (id, date, exercises) => ({ session_id: id, kind: 'workout', date, start_time: `${date}T18:00:00-04:00`, unit: 'kg', exercises });
const squat = (sets, extra = {}) => ({ exercise_id: 'back-squat', name_performed: 'Back squat', skipped: false, load_basis: 'total', per_side: false, type: 'strength', sets, ...extra });

test('topOfRange', () => {
  assert.equal(topOfRange('3-5'), 5);
  assert.equal(topOfRange('12-15'), 15);
  assert.equal(topOfRange('5'), 5);
  assert.equal(topOfRange('10/side'), 10);
  assert.equal(topOfRange('8 to 10'), 10);
  assert.equal(topOfRange('30s hold'), null);
  assert.equal(topOfRange(null), null);
});

const sessions = [
  session('a', '2026-03-02', [squat([set(1, 90, 6), set(2, 90, 6)])]),
  session('b', '2026-03-09', [squat([], { skipped: true })]),
];
const current = session('c', '2026-03-16', []);

test('lastPerformance skips over a skipped session but reports it', () => {
  const r = lastPerformance(sessions, 'back-squat', current);
  assert.equal(r.last.session.session_id, 'a');
  assert.equal(r.skippedLastTime, true);
  assert.equal(r.skippedDate, '2026-03-09');
});

test('lastPerformance ignores sessions after the one being edited', () => {
  const r = lastPerformance(sessions, 'back-squat', session('old', '2026-03-01', []));
  assert.equal(r.last, null);
});

test('prefill uses same set number last time, else target weight and top of range', () => {
  const { last } = lastPerformance(sessions, 'back-squat', current);
  const prog = { target_weight: 95, reps: '4-6' };
  assert.deepEqual(prefillSet(0, last.ex, last.session, prog, 'kg', 'kg'), { weight: 90, reps: 6 });
  assert.deepEqual(prefillSet(2, last.ex, last.session, prog, 'kg', 'kg'), { weight: 95, reps: 6 });
  assert.deepEqual(prefillSet(0, null, null, { target_weight: null, reps: '3-5' }, 'kg', 'kg'), { weight: null, reps: 5 });
});

test('prefill converts a kg history into lb display, rounded to 0.5', () => {
  const { last } = lastPerformance(sessions, 'back-squat', current);
  assert.deepEqual(prefillSet(0, last.ex, last.session, { target_weight: null, reps: '5' }, 'kg', 'lb'), { weight: 198.5, reps: 6 });
});

test('formatSets', () => {
  assert.equal(formatSets(squat([set(1, 110, 3), set(2, 110, 5), set(3, 110, 3)]), 'kg', 'kg'), '110kg x 3, 5, 3');
  assert.equal(formatSets(squat([set(1, 110, 3), set(2, 120, 3)]), 'kg', 'kg'), '110kg x 3, 120kg x 3');
  const bw = { exercise_id: 'pull-up', type: 'bodyweight', load_basis: 'added', sets: [set(1, null, 4), set(2, 6, 4)] };
  assert.equal(formatSets(bw, 'kg', 'kg'), 'BW x 4, BW+6kg x 4');
  assert.equal(formatSets(squat([set(1, null, null), set(2, null, null)]), 'kg', 'kg'), 'done (no numbers)');
  assert.equal(formatSets(squat([set(1, 100, 5, { completed: false })]), 'kg', 'kg'), '');
});

test('priorSets filters by load basis and ignores skipped exercises', () => {
  const s2 = [...sessions, session('d', '2026-03-10', [squat([set(1, 50, 5)], { load_basis: 'per_side' })])];
  const p = priorSets(s2, 'back-squat', 'total', current);
  assert.deepEqual(p.map((x) => x.weight), [90, 90]);
});

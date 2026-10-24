import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topOfRange, lastPerformance, prefillSet, formatSets, priorSets, defaultVariant, lastSetupForName,
  namesUsed, variantOf, isFinished, nextUnloggedWeek, kindOf, setUnit } from '../js/history.js';

const set = (n, weight, reps, extra = {}) => ({ set_number: n, weight, reps, rpe: null, set_note: null, completed: true, ...extra });
const session = (id, date, exercises, extra = {}) => ({ session_id: id, kind: 'workout', date, start_time: `${date}T18:00:00-04:00`, unit: 'kg', exercises, ...extra });
const squat = (sets, extra = {}) => ({ exercise_id: 'back-squat', name_performed: 'Back squat', skipped: false, load_basis: 'total', per_side: false, sets, ...extra });
const V = (o = {}) => ({ exercise_id: 'back-squat', name_performed: 'Back squat', load_basis: 'total', unit: 'kg', ...o });

test('topOfRange', () => {
  assert.equal(topOfRange('3-5'), 5);
  assert.equal(topOfRange('12-15'), 15);
  assert.equal(topOfRange('5'), 5);
  assert.equal(topOfRange('10/side'), 10);
  assert.equal(topOfRange('8 to 10'), 10);
  assert.equal(topOfRange('5 alternating 5 s holds'), 5);
  assert.equal(topOfRange('30s hold'), null);
  assert.equal(topOfRange('max'), null);
  assert.equal(topOfRange('near max'), null);
  assert.equal(topOfRange(null), null);
});

const sessions = [
  session('a', '2026-03-02', [squat([set(1, 90, 6), set(2, 90, 6)])]),
  session('b', '2026-03-09', [squat([], { skipped: true })]),
];
const current = session('c', '2026-03-16', []);

test('lastPerformance skips over a skipped session but reports it', () => {
  const r = lastPerformance(sessions, V(), current);
  assert.equal(r.last.session.session_id, 'a');
  assert.equal(r.skippedLastTime, true);
  assert.equal(r.skippedDate, '2026-03-09');
});

test('lastPerformance ignores sessions after the one being edited', () => {
  assert.equal(lastPerformance(sessions, V(), session('old', '2026-03-01', [])).last, null);
});

test('variants never mix: safety-bar squat vs back squat, lb machine vs kg machine', () => {
  const s = [
    session('a', '2026-03-02', [squat([set(1, 100, 5)])]),
    session('b', '2026-03-04', [squat([set(1, 92, 6)], { name_performed: 'Safety-bar squat' })]),
    session('c', '2026-03-06', [{ exercise_id: 'lat-pulldown', name_performed: 'Lat pulldown', load_basis: 'total', unit: 'lb', sets: [set(1, 200, 10)] }]),
    session('d', '2026-03-08', [{ exercise_id: 'lat-pulldown', name_performed: 'Lat pulldown', load_basis: 'per_side', sets: [set(1, 50, 8)] }]),
  ];
  const now = session('z', '2026-03-20', []);
  assert.equal(lastPerformance(s, V(), now).last.session.session_id, 'a');
  assert.equal(lastPerformance(s, V({ name_performed: 'Safety-bar squat' }), now).last.session.session_id, 'b');
  const lat = { exercise_id: 'lat-pulldown', name_performed: 'Lat pulldown' };
  assert.equal(lastPerformance(s, { ...lat, load_basis: 'total', unit: 'lb' }, now).last.session.session_id, 'c');
  assert.equal(lastPerformance(s, { ...lat, load_basis: 'per_side', unit: 'kg' }, now).last.session.session_id, 'd');
  assert.equal(lastPerformance(s, { ...lat, load_basis: 'total', unit: 'kg' }, now).last, null);
  assert.deepEqual(priorSets(s, V(), now).map((x) => x.weight), [100]);
});

test('exercise-level unit overrides the session unit; set unit overrides both', () => {
  const sess = session('a', '2026-03-02', []);
  const ex = { exercise_id: 'x', unit: 'lb', sets: [] };
  assert.equal(variantOf({ ...ex, name_performed: 'X', load_basis: 'assist' }, sess).unit, 'lb');
  assert.equal(setUnit({ weight: 1 }, ex, sess), 'lb');
  assert.equal(setUnit({ weight: 1, unit: 'kg' }, ex, sess), 'kg');
  assert.equal(setUnit({ weight: 1 }, { sets: [] }, sess), 'kg');
});

test('defaultVariant follows what you did last time, else the program', () => {
  const s = [
    session('a', '2026-03-02', [{ exercise_id: 'split-squat', name_performed: 'Walking lunges', load_basis: 'per_hand', sets: [set(1, 20, 8)] }]),
    session('b', '2026-03-04', [{ exercise_id: 'lat-pulldown', name_performed: 'Lat pulldown', load_basis: 'per_side', sets: [set(1, 50, 8)] }]),
  ];
  const now = session('z', '2026-03-20', []);
  assert.deepEqual(defaultVariant(s, { exercise_id: 'split-squat', name: 'FFE split squat', load_basis: 'per_hand' }, now, 'kg'),
    { exercise_id: 'split-squat', name_performed: 'Walking lunges', load_basis: 'per_hand', unit: 'kg' });
  assert.equal(defaultVariant(s, { exercise_id: 'lat-pulldown', name: 'Lat pulldown', load_basis: 'total' }, now, 'kg').load_basis, 'per_side');
  assert.deepEqual(defaultVariant(s, { exercise_id: 'new-one', name: 'New', load_basis: 'total' }, now, 'lb'),
    { exercise_id: 'new-one', name_performed: 'New', load_basis: 'total', unit: 'lb' });
  assert.deepEqual(lastSetupForName(s, 'lat-pulldown', 'Lat pulldown', now), { load_basis: 'per_side', unit: 'kg' });
  assert.deepEqual(namesUsed(s, 'split-squat'), ['Walking lunges']);
});

test('prefill: same set number, else last set done last time, else program target', () => {
  const { last } = lastPerformance(sessions, V(), current);
  const prog = { target_weight: 95, reps: '4-6' };
  assert.deepEqual(prefillSet(0, last.ex, last.session, prog, 'kg', 'kg'), { weight: 90, reps: 6 });
  // program now asks for 4 sets but only 2 were done last time: use the last one done
  assert.deepEqual(prefillSet(3, last.ex, last.session, prog, 'kg', 'kg'), { weight: 90, reps: 6 });
  assert.deepEqual(prefillSet(0, null, null, { target_weight: null, reps: '3-5' }, 'kg', 'kg'), { weight: null, reps: 5 });
  assert.deepEqual(prefillSet(0, null, null, { target_weight: 60, reps: 'max' }, 'kg', 'kg'), { weight: 60, reps: null });
});

test('prefill keeps unrecorded reps blank-safe and converts a kg history into lb', () => {
  const s = [session('a', '2026-03-02', [squat([set(1, 100, null)])])];
  const { last } = lastPerformance(s, V(), current);
  assert.deepEqual(prefillSet(0, last.ex, last.session, { target_weight: null, reps: '3-5' }, 'kg', 'kg'), { weight: 100, reps: 5 });
  assert.deepEqual(prefillSet(0, last.ex, last.session, { target_weight: null, reps: '5' }, 'kg', 'lb'), { weight: 220.5, reps: 5 });
});

test('formatSets uses the exercise unit and labels assistance', () => {
  const sess = session('a', '2026-03-02', []);
  assert.equal(formatSets(squat([set(1, 110, 3), set(2, 110, 5), set(3, 110, 3)]), sess, 'kg'), '110kg x 3, 5, 3');
  assert.equal(formatSets(squat([set(1, 110, 3), set(2, 120, 3)]), sess, 'kg'), '110kg x 3, 120kg x 3');
  const bw = { exercise_id: 'pull-up', type: 'bodyweight', load_basis: 'added', sets: [set(1, null, 4), set(2, 6, 4)] };
  assert.equal(formatSets(bw, sess, 'kg'), 'BW x 4, BW+6kg x 4');
  const neg = { exercise_id: 'neg', load_basis: 'assist', unit: 'lb', sets: [set(1, 60, 3), set(2, 50, 3)] };
  assert.equal(formatSets(neg, sess, 'lb'), '60lb assist x 3, 50lb assist x 3');
  assert.equal(formatSets(squat([set(1, null, null), set(2, null, null)]), sess, 'kg'), 'done (no numbers)');
  assert.equal(formatSets(squat([set(1, 100, 5, { completed: false })]), sess, 'kg'), '');
});

test('isFinished: end time, or an imported log with no times', () => {
  assert.equal(isFinished({ end_time: '2026-01-01T10:00' }), true);
  assert.equal(isFinished({ start_time: null, end_time: null }), true);
  assert.equal(isFinished({ start_time: '2026-01-01T09:00', end_time: null }), false);
});

test('kindOf infers missing kinds', () => {
  assert.equal(kindOf({ exercises: [] }), 'workout');
  assert.equal(kindOf({ cardio_type: 'bike' }), 'cardio');
  assert.equal(kindOf({ kind: 'cardio' }), 'cardio');
});

test('nextUnloggedWeek: the week after the latest logged week, gaps ignored', () => {
  const program = { program_name: 'P', weeks: [1, 2, 3, 4, 5, 6, 7, 8].map((week) => ({ week, days: [] })) };
  const logged = [1, 2, 3, 4, 5, 6].map((w) => ({ kind: 'workout', program_name: 'P', week: w }));
  assert.equal(nextUnloggedWeek(program, logged), 7);
  assert.equal(nextUnloggedWeek(program, logged.filter((s) => s.week !== 4)), 7);
  assert.equal(nextUnloggedWeek(program, []), 1);
  assert.equal(nextUnloggedWeek(program, [{ program_name: 'Other', week: 6 }]), 1);
  assert.equal(nextUnloggedWeek(program, [{ program_name: 'P', week: 8 }]), 8);
});

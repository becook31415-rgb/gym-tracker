import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pbFlags } from '../js/pb.js';

const s = (weight, reps, unit = 'kg', completed = true) => ({ weight, reps, unit, completed });

test('first ever set is not a PB', () => {
  assert.deepEqual(pbFlags([], [s(100, 5)]), [false]);
});

test('heavier weight with at least 1 rep is a PB', () => {
  assert.deepEqual(pbFlags([s(100, 5)], [s(102.5, 1)]), [true]);
});

test('same weight, more reps is a PB; same reps is not', () => {
  assert.deepEqual(pbFlags([s(100, 5)], [s(100, 6), s(100, 6)]), [true, false]);
});

test('lighter weight with more reps is not a PB', () => {
  assert.deepEqual(pbFlags([s(100, 5)], [s(90, 12)]), [false]);
});

test('more reps at an older, lighter weight does not count once a heavier best exists', () => {
  assert.deepEqual(pbFlags([s(90, 6), s(100, 3)], [s(90, 8)]), [false]);
});

test('earlier sets in the same session raise the bar for later sets', () => {
  assert.deepEqual(pbFlags([s(100, 5)], [s(110, 3), s(110, 3), s(110, 5)]), [true, false, true]);
});

test('blank reps or blank weight are ignored on weighted exercises', () => {
  assert.deepEqual(pbFlags([s(100, 5)], [s(150, null), s(null, 10), s(101, 1)]), [false, false, true]);
});

test('zero reps and unconfirmed sets are ignored', () => {
  assert.deepEqual(pbFlags([s(100, 5)], [s(120, 0), s(120, 3, 'kg', false), s(105, 2)]), [false, false, true]);
});

test('unconfirmed prior sets do not count as history', () => {
  assert.deepEqual(pbFlags([s(200, 5, 'kg', false), s(100, 5)], [s(110, 5)]), [true]);
});

test('bodyweight only: highest reps in a single set', () => {
  const opts = { bodyweight: true };
  assert.deepEqual(pbFlags([s(null, 50)], [s(null, 63), s(0, 63), s(0, 64)], opts), [true, false, true]);
});

test('bodyweight: added weight uses the weight rules, separately from BW-only reps', () => {
  const opts = { bodyweight: true };
  assert.deepEqual(pbFlags([s(null, 4), s(4, 4)], [s(6, 4), s(null, 4), s(null, 5)], opts), [true, false, true]);
});

test('compares across units (kg vs lb)', () => {
  // 100 kg = 220.46 lb
  assert.deepEqual(pbFlags([s(100, 5)], [s(225, 1, 'lb'), s(215, 10, 'lb')]), [true, false]);
});

test('assisted exercises: less assistance is a PB; same assistance with more reps too', () => {
  const opts = { lowerIsBetter: true };
  const a = (w, r) => s(w, r, 'lb');
  assert.deepEqual(pbFlags([a(60, 3), a(50, 3)], [a(50, 3), a(40, 3), a(40, 4), a(60, 8)], opts), [false, true, true, false]);
  assert.deepEqual(pbFlags([a(40, 3)], [a(0, 3)], opts), [true]);
});

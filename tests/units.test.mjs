import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNum, parseIntOrNull, convert, displayNumber, prefillNumber, loadBasisLabel, weightText, toKg } from '../js/units.js';

test('parseNum handles decimals, commas and blanks', () => {
  assert.equal(parseNum('102.5'), 102.5);
  assert.equal(parseNum('102,5'), 102.5);
  assert.equal(parseNum(' 6 '), 6);
  assert.equal(parseNum(''), null);
  assert.equal(parseNum('abc'), null);
  assert.equal(parseNum(null), null);
  assert.equal(parseIntOrNull('8'), 8);
});

test('kg <-> lb conversion', () => {
  assert.equal(Math.round(convert(100, 'kg', 'lb') * 100) / 100, 220.46);
  assert.equal(Math.round(convert(225, 'lb', 'kg') * 100) / 100, 102.06);
  assert.equal(convert(102.5, 'kg', 'kg'), 102.5);
  assert.equal(toKg(null, 'lb'), null);
});

test('display keeps same-unit numbers exact and rounds converted ones to 0.1', () => {
  assert.equal(displayNumber(102.5, 'kg', 'kg'), 102.5);
  assert.equal(displayNumber(100, 'kg', 'lb'), 220.5);
  assert.equal(prefillNumber(100, 'kg', 'lb'), 220.5);
  assert.equal(prefillNumber(110, 'kg', 'lb'), 242.5);
});

test('load basis labels never multiply the number', () => {
  assert.equal(loadBasisLabel('total', 'kg'), 'kg');
  assert.equal(loadBasisLabel('per_hand', 'kg'), 'kg per hand');
  assert.equal(loadBasisLabel('per_side', 'lb'), 'lb per side');
  assert.equal(loadBasisLabel('added', 'kg'), 'kg added');
  assert.equal(weightText(22, 'kg', 'kg', { type: 'strength', load_basis: 'per_hand' }), '22kg');
});

test('bodyweight weight text: blank or 0 is BW, a number is added weight', () => {
  const bw = { type: 'bodyweight', load_basis: 'added' };
  assert.equal(weightText(null, 'kg', 'kg', bw), 'BW');
  assert.equal(weightText(0, 'kg', 'kg', bw), 'BW');
  assert.equal(weightText(6, 'kg', 'kg', bw), 'BW+6kg');
  assert.equal(weightText(null, 'kg', 'kg', { type: 'strength', load_basis: 'total' }), '–');
});

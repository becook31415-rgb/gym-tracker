import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitProgramName, weekCount, weekRangeLabel, weekForDate, sessionTitle, dateLabel } from '../js/display.js';

const prog = (o = {}) => ({
  program_name: 'Test Block', start_date: '2026-09-14', duration_weeks: 8,
  weeks: [1, 2, 3, 4, 5, 6, 7, 8].map((week) => ({ week, days: [] })), ...o,
});

test('splitProgramName moves a trailing date range into the subtitle', () => {
  assert.deepEqual(splitProgramName(prog({ program_name: 'Power Block Sep-Nov 2026' })), { title: 'Power Block', subtitle: 'Sep–Nov 2026' });
  assert.deepEqual(splitProgramName(prog({ program_name: 'Block 5 - Dec 2026 - Feb 2027' })), { title: 'Block 5', subtitle: 'Dec 2026–Feb 2027' });
  assert.deepEqual(splitProgramName(prog({ program_name: 'Power (Oct 2026)' })), { title: 'Power', subtitle: 'Oct 2026' });
});

test('splitProgramName without dates in the name derives them from start_date', () => {
  assert.deepEqual(splitProgramName(prog({ program_name: 'Upper/Lower' })), { title: 'Upper/Lower', subtitle: 'Sep–Nov 2026' });
  assert.deepEqual(splitProgramName(prog({ program_name: 'Winter', start_date: '2026-12-07' })), { title: 'Winter', subtitle: 'Dec 2026–Jan 2027' });
  assert.deepEqual(splitProgramName({ program_name: 'No dates', weeks: [{ week: 1, days: [{ scheduled_date: null }] }] }), { title: 'No dates', subtitle: '' });
  // a month-like word that is the whole name is not split
  assert.equal(splitProgramName(prog({ program_name: 'May 2026' })).title, 'May 2026');
});

test('weekCount comes from the program, never hard-coded', () => {
  assert.equal(weekCount(prog()), 8);
  assert.equal(weekCount(prog({ duration_weeks: 12 })), 12);
  assert.equal(weekCount({ weeks: [{ week: 1 }, { week: 2 }, { week: 3 }, { week: 4 }, { week: 5 }, { week: 6 }] }), 6);
  assert.equal(weekCount({ duration_weeks: 8, weeks: [{ week: 4 }, { week: 6 }, { week: 7 }] }), 8);
});

test('week ranges and today\'s week', () => {
  const p = prog();
  assert.equal(weekRangeLabel(p, 7), '26 Oct – 1 Nov');
  assert.equal(weekRangeLabel(p, 1), '14 Sep – 20 Sep');
  assert.equal(weekForDate(p, new Date(2026, 9, 25)), 6);
  assert.equal(weekForDate(p, new Date(2026, 9, 26, 7, 30)), 7);
  assert.equal(weekForDate(p, new Date(2026, 8, 13)), null);
  assert.equal(weekForDate(p, new Date(2026, 10, 9)), null);
  // no start_date: falls back to the week's first scheduled date
  const q = { weeks: [{ week: 3, days: [{ scheduled_date: '2026-03-23' }, { scheduled_date: '2026-03-25' }] }] };
  assert.equal(weekRangeLabel(q, 3), '23 Mar – 29 Mar');
  assert.equal(weekRangeLabel({ weeks: [{ week: 1, days: [] }] }, 1), '');
});

test('sessionTitle tidies day names', () => {
  assert.deepEqual(sessionTitle('Day 2 - Hinge + Vertical Press + Pull (Wed)', 1), { title: 'Hinge, Vertical Press, Pull', dayLabel: 'Day 2' });
  assert.deepEqual(sessionTitle('Day 3 - Secondary Lower + Press + Pull + Core (Fri)', 2), { title: 'Secondary Lower, Press, Pull, Core', dayLabel: 'Day 3' });
  assert.deepEqual(sessionTitle('Upper body', 0), { title: 'Upper body', dayLabel: 'Day 1' });
  assert.deepEqual(sessionTitle('Day 4', 3), { title: 'Day 4', dayLabel: 'Day 4' });
});

test('dateLabel', () => {
  assert.equal(dateLabel('2026-10-28'), 'Wed 28 Oct');
  assert.equal(dateLabel('2026-09-14'), 'Mon 14 Sep');
  assert.equal(dateLabel(null), null);
});

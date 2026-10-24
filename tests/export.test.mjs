import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSetRows, buildCardioRows, buildExportFiles, mergeBackup, validateBackup, fileStamp, hasUnexported, exportReminderDue, SET_COLUMNS } from '../js/export.js';
import { parseCSV } from '../js/csv.js';

const workout = {
  session_id: 'w1', kind: 'workout', date: '2026-03-02', start_time: '2026-03-02T18:00:00-05:00', end_time: null,
  program_name: 'Block', week: 1, day_name: 'Day 1', unit: 'kg', session_notes: 'Felt good, "strong"', updated_at: '2026-03-02T19:00:00-05:00',
  exercises: [
    { exercise_id: 'db-press', name_performed: 'Incline DB press', skipped: false, load_basis: 'per_hand', per_side: false, type: 'strength',
      sets: [
        { set_number: 2, weight: 24, reps: 8, rpe: 8, set_note: null, completed: true, unit: 'kg' },
        { set_number: 1, weight: 22, reps: 8, rpe: null, set_note: 'warm, easy', completed: true, unit: 'kg' },
        { set_number: 3, weight: 26, reps: 6, rpe: null, set_note: null, completed: false, unit: 'kg' },
      ] },
    { exercise_id: 'snow-angel', name_performed: 'Snow angels', skipped: true, load_basis: 'added', per_side: false, type: 'bodyweight', sets: [] },
    { exercise_id: 'bike-warmup', name_performed: 'Bike', skipped: false, type: 'cardio', exercise_note: 'easy', sets: [],
      cardio: { cardio_type: 'bike', duration_min: 10, intensity_rpe: 4, completed: true } },
  ],
};
const cardio = { session_id: 'c1', kind: 'cardio', date: '2026-03-03', start_time: '2026-03-03T07:00:00-05:00', cardio_type: 'run', duration_min: 30, intensity_rpe: 6, notes: 'park loop', updated_at: '2026-03-03T07:40:00-05:00' };
const demo = { ...cardio, session_id: 'demo-1', demo: true };

test('set rows: one per confirmed set, ordered, with stored weight and unit untouched', () => {
  const rows = buildSetRows([workout]);
  assert.equal(rows.length, 2);
  const r = Object.fromEntries(SET_COLUMNS.map((c, i) => [c, rows[0][i]]));
  assert.equal(r.set_number, 1);
  assert.equal(r.weight, 22);
  assert.equal(r.unit, 'kg');
  assert.equal(r.load_basis, 'per_hand');
  assert.equal(r.set_note, 'warm, easy');
});

test('cardio rows include standalone sessions and cardio done inside a workout, never demo data', () => {
  const rows = buildCardioRows([workout, cardio, demo]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r[7]), ['workout', 'standalone']);
});

test('export files: names, CSV quoting round-trips, JSON has schema_version and exported_at', () => {
  const now = new Date(2026, 9, 24, 8, 5);
  const files = buildExportFiles([workout, cardio, demo], [{ id: 'p1', exercise_id: 'db-press', text: 'Bench #4', demo: false }], now);
  assert.deepEqual(files.map((f) => f.name), ['workout-log_2026-10-24_0805.json', 'workout-sets_2026-10-24_0805.csv', 'workout-cardio_2026-10-24_0805.csv']);
  const log = JSON.parse(files[0].text);
  assert.equal(log.schema_version, 1);
  assert.ok(log.exported_at.startsWith('2026-10-24T08:05'));
  assert.equal(log.sessions.length, 1);
  assert.equal(log.cardio_sessions.length, 1);
  const csv = parseCSV(files[1].text);
  assert.deepEqual(csv[0], SET_COLUMNS);
  assert.equal(csv[1][13], 'warm, easy');
  assert.equal(csv[1][14], 'Felt good, "strong"');
});

test('fileStamp pads', () => {
  assert.equal(fileStamp(new Date(2026, 0, 5, 7, 3)), '2026-01-05_0703');
});

test('restore merges by session_id without duplicates; newer copy wins', () => {
  const backup = JSON.parse(buildExportFiles([workout, cardio], [], new Date()).find((f) => f.name.endsWith('.json')).text);
  assert.equal(validateBackup(backup), null);
  const r1 = mergeBackup([workout, cardio], [], backup);
  assert.deepEqual([r1.added, r1.updated, r1.unchanged, r1.toPut.length], [0, 0, 2, 0]);
  const r2 = mergeBackup([], [], backup);
  assert.equal(r2.added, 2);
  const newer = { ...backup, sessions: [{ ...workout, session_notes: 'edited', updated_at: '2026-03-05T10:00:00-05:00' }] };
  const r3 = mergeBackup([workout, cardio], [], newer);
  assert.equal(r3.updated, 1);
  assert.equal(r3.toPut[0].session_notes, 'edited');
});

test('validateBackup rejects other files', () => {
  assert.match(validateBackup({ schema_version: 1, weeks: [] }), /not a workout-log backup/);
  assert.match(validateBackup({ app: 'gym-tracker', schema_version: 1, sessions: [{ kind: 'workout' }] }), /no session_id/);
});

test('export reminder only when unexported real data is over 7 days old', () => {
  const now = new Date('2026-03-20T12:00:00-05:00');
  assert.equal(hasUnexported([demo], null), false);
  assert.equal(exportReminderDue([workout], null, now), true);
  assert.equal(exportReminderDue([workout], '2026-03-15T00:00:00-05:00', now), false);
  assert.equal(exportReminderDue([{ ...workout, updated_at: '2026-03-19T00:00:00-05:00' }], '2026-03-10T00:00:00-05:00', now), true);
});

test('sample history is valid backup-shaped data and fully marked demo', () => {
  const h = JSON.parse(readFileSync(new URL('../data/sample-history.json', import.meta.url), 'utf8'));
  assert.equal(validateBackup(h), null);
  for (const s of [...h.sessions, ...h.cardio_sessions]) assert.equal(s.demo, true, s.session_id);
  for (const p of h.pinned_notes) assert.equal(p.demo, true);
  assert.equal(buildSetRows(h.sessions).length, 0, 'demo data must never be exported');
});

// Export file building and backup merging. Pure functions, no DOM.
// The code that actually hands files to iOS lives in exporter.js.

import { toCSV } from './csv.js';
import { sortSessions, kindOf, setUnit } from './history.js';
import { LOAD_BASES, UNITS } from './units.js';

export const LOG_SCHEMA_VERSION = 1;

export const SET_COLUMNS = ['session_id', 'date', 'week', 'day_name', 'exercise_id', 'name_performed', 'set_number',
  'weight', 'unit', 'load_basis', 'per_side', 'reps', 'rpe', 'set_note', 'session_notes', 'program_name'];

export const CARDIO_COLUMNS = ['session_id', 'date', 'start_time', 'cardio_type', 'duration_min', 'intensity_rpe',
  'notes', 'source', 'exercise_id'];

const pad = (n) => String(n).padStart(2, '0');

// "2026-10-24_0815" in local time
export function fileStamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// Local ISO time with UTC offset, e.g. "2026-10-24T08:15:00-04:00"
export function localISO(d) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function localDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const real = (sessions) => sessions.filter((s) => !s.demo);

// One row per confirmed set. Skipped exercises have no rows (they are in the JSON log).
export function buildSetRows(sessions) {
  const rows = [];
  for (const s of sortSessions(real(sessions)).filter((x) => kindOf(x) === 'workout')) {
    for (const ex of s.exercises || []) {
      if (ex.skipped || ex.type === 'cardio') continue;
      const sets = [...(ex.sets || [])].filter((st) => st.completed).sort((a, b) => a.set_number - b.set_number);
      for (const st of sets) {
        rows.push([s.session_id, s.date, s.week, s.day_name, ex.exercise_id, ex.name_performed, st.set_number,
          st.weight, setUnit(st, ex, s), ex.load_basis, ex.per_side, st.reps, st.rpe, st.set_note, s.session_notes, s.program_name]);
      }
    }
  }
  return rows;
}

// Standalone cardio sessions plus cardio exercises done inside a workout.
export function buildCardioRows(sessions) {
  const rows = [];
  for (const s of sortSessions(real(sessions))) {
    if (kindOf(s) === 'cardio') {
      rows.push([s.session_id, s.date, s.start_time, s.cardio_type, s.duration_min, s.intensity_rpe, s.notes, 'standalone', '']);
    } else {
      for (const ex of s.exercises || []) {
        if (ex.type !== 'cardio' || ex.skipped || !ex.cardio || !ex.cardio.completed) continue;
        rows.push([s.session_id, s.date, s.start_time, ex.cardio.cardio_type, ex.cardio.duration_min, ex.cardio.intensity_rpe,
          ex.exercise_note, 'workout', ex.exercise_id]);
      }
    }
  }
  return rows;
}

export function buildLog(sessions, pins, now) {
  const r = sortSessions(real(sessions));
  return {
    schema_version: LOG_SCHEMA_VERSION,
    app: 'gym-tracker',
    exported_at: localISO(now),
    sessions: r.filter((s) => kindOf(s) === 'workout'),
    cardio_sessions: r.filter((s) => kindOf(s) === 'cardio'),
    pinned_notes: pins.filter((p) => !p.demo),
  };
}

/** @returns {Array<{name:string, type:string, text:string}>} */
export function buildExportFiles(sessions, pins, now) {
  const stamp = fileStamp(now);
  return [
    { name: `workout-log_${stamp}.json`, type: 'application/json', text: JSON.stringify(buildLog(sessions, pins, now), null, 2) },
    { name: `workout-sets_${stamp}.csv`, type: 'text/csv', text: toCSV([SET_COLUMNS, ...buildSetRows(sessions)]) },
    { name: `workout-cardio_${stamp}.csv`, type: 'text/csv', text: toCSV([CARDIO_COLUMNS, ...buildCardioRows(sessions)]) },
  ];
}

// True when there is real (non-demo) data changed since the last export.
export function hasUnexported(sessions, lastExportAt) {
  return real(sessions).some((s) => !lastExportAt || (s.updated_at || '') > lastExportAt);
}

// Show the reminder banner when unexported data is more than 7 days old.
export function exportReminderDue(sessions, lastExportAt, now) {
  if (!hasUnexported(sessions, lastExportAt)) return false;
  const week = 7 * 24 * 3600 * 1000;
  if (lastExportAt) return now - new Date(lastExportAt) > week;
  const oldest = real(sessions).map((s) => s.updated_at).filter(Boolean).sort()[0];
  return !!oldest && now - new Date(oldest) > week;
}

// ---------------- Restore from backup ----------------

const isNumOrNull = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isFinite(v));

/**
 * Check a workout-log backup (this app's export, or a hand-made file in the same shape).
 * Nothing is rewritten except filling in a missing "kind". Returns every problem found.
 * @returns {{errors: string[], warnings: string[], backup: object|null, counts: {sessions, cardio, sets}}}
 */
export function checkBackup(obj) {
  const errors = [];
  const warnings = [];
  const counts = { sessions: 0, cardio: 0, sets: 0 };
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !Array.isArray(obj.sessions)) {
    return { errors: ['This is not a workout-log backup file (it needs a "sessions" list).'], warnings, backup: null, counts };
  }
  if (obj.schema_version !== LOG_SCHEMA_VERSION) errors.push(`"schema_version" must be ${LOG_SCHEMA_VERSION} (got ${JSON.stringify(obj.schema_version)}).`);
  if (obj.app !== undefined && obj.app !== 'gym-tracker') errors.push(`"app" is ${JSON.stringify(obj.app)}, expected "gym-tracker".`);
  if (obj.app === undefined) warnings.push('No "app" field; treated as a gym-tracker log because the structure matches.');
  if (obj.cardio_sessions !== undefined && !Array.isArray(obj.cardio_sessions)) errors.push('"cardio_sessions" must be a list.');
  if (obj.pinned_notes !== undefined && !Array.isArray(obj.pinned_notes)) errors.push('"pinned_notes" must be a list.');

  const ids = new Set();
  let missingKind = 0;
  let missingUpdated = 0;
  const all = [...obj.sessions, ...(Array.isArray(obj.cardio_sessions) ? obj.cardio_sessions : [])];
  const sessions = all.map((s, i) => {
    let where = `Session ${i + 1}`;
    if (!s || typeof s !== 'object') { errors.push(`${where}: must be an object.`); return s; }
    where += s.date ? ` (${s.date}${s.week != null ? `, week ${s.week}` : ''}${s.day_name ? `, ${s.day_name}` : ''})` : '';
    if (typeof s.session_id !== 'string' || !s.session_id) errors.push(`${where}: "session_id" is missing.`);
    else if (ids.has(s.session_id)) errors.push(`${where}: session_id ${s.session_id} appears twice.`);
    else ids.add(s.session_id);
    if (typeof s.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) errors.push(`${where}: "date" must look like "2026-09-14".`);
    if (s.updated_at === undefined) missingUpdated++;
    if (s.kind !== undefined && s.kind !== 'workout' && s.kind !== 'cardio') errors.push(`${where}: "kind" must be "workout" or "cardio".`);
    const out = s.kind ? s : { ...s, kind: kindOf(s) };
    if (!s.kind) missingKind++;
    if (out.kind === 'cardio') { counts.cardio++; return out; }
    counts.sessions++;
    if (s.unit !== undefined && !UNITS.includes(s.unit)) errors.push(`${where}: "unit" must be "kg" or "lb".`);
    if (!Array.isArray(s.exercises)) { errors.push(`${where}: "exercises" must be a list.`); return out; }
    s.exercises.forEach((ex, ei) => {
      const ew = `${where}, exercise ${ei + 1}${ex && ex.name_performed ? ` ("${ex.name_performed}")` : ''}`;
      if (!ex || typeof ex !== 'object') { errors.push(`${ew}: must be an object.`); return; }
      if (typeof ex.exercise_id !== 'string' || !ex.exercise_id) errors.push(`${ew}: "exercise_id" is missing.`);
      if (ex.load_basis !== undefined && !LOAD_BASES.includes(ex.load_basis)) errors.push(`${ew}: "load_basis" ${JSON.stringify(ex.load_basis)} is not one of ${LOAD_BASES.join(', ')}.`);
      if (ex.unit !== undefined && !UNITS.includes(ex.unit)) errors.push(`${ew}: "unit" must be "kg" or "lb".`);
      if (!Array.isArray(ex.sets)) { errors.push(`${ew}: "sets" must be a list.`); return; }
      ex.sets.forEach((st, si) => {
        const sw = `${ew}, set ${si + 1}`;
        counts.sets++;
        if (!st || typeof st !== 'object') { errors.push(`${sw}: must be an object.`); return; }
        if (!Number.isInteger(st.set_number)) errors.push(`${sw}: "set_number" must be a whole number.`);
        if (!isNumOrNull(st.weight)) errors.push(`${sw}: "weight" must be a number or null (got ${JSON.stringify(st.weight)}).`);
        if (!(st.reps === null || st.reps === undefined || Number.isInteger(st.reps))) errors.push(`${sw}: "reps" must be a whole number or null (got ${JSON.stringify(st.reps)}).`);
        if (!isNumOrNull(st.rpe)) errors.push(`${sw}: "rpe" must be a number or null.`);
        if (st.unit !== undefined && !UNITS.includes(st.unit)) errors.push(`${sw}: "unit" must be "kg" or "lb".`);
        if (typeof st.completed !== 'boolean') errors.push(`${sw}: "completed" must be true or false.`);
      });
    });
    return out;
  });
  if (missingKind) warnings.push(`${missingKind} session(s) had no "kind"; set to "workout"/"cardio" from their contents.`);
  if (missingUpdated) warnings.push(`${missingUpdated} session(s) have no "updated_at"; if the same session_id is already on this phone, the phone's copy is kept.`);
  if (errors.length) return { errors: errors.slice(0, 40), warnings, backup: null, counts };
  return {
    errors, warnings, counts,
    backup: { ...obj, sessions: sessions.filter((s) => s.kind === 'workout'), cardio_sessions: sessions.filter((s) => s.kind === 'cardio'), pinned_notes: obj.pinned_notes || [] },
  };
}

// Short form used by older callers/tests: first error, or null when valid.
export function validateBackup(obj) {
  const r = checkBackup(obj);
  return r.errors.length ? r.errors[0] : null;
}

/**
 * Merge a backup into existing data by session_id (and pin id). Never duplicates.
 * When both sides have the same id, the more recently updated copy wins.
 */
export function mergeBackup(existingSessions, existingPins, backup) {
  const byId = new Map(existingSessions.map((s) => [s.session_id, s]));
  const toPut = [];
  let added = 0; let updated = 0; let unchanged = 0;
  for (const s of [...backup.sessions, ...(backup.cardio_sessions || [])]) {
    const cur = byId.get(s.session_id);
    if (!cur) { toPut.push(s); added++; }
    else if ((s.updated_at || '') > (cur.updated_at || '')) { toPut.push(s); updated++; }
    else unchanged++;
  }
  const pinIds = new Map(existingPins.map((p) => [p.id, p]));
  const pinsToPut = (backup.pinned_notes || []).filter((p) => {
    const cur = pinIds.get(p.id);
    return !cur || (p.updated_at || '') > (cur.updated_at || '');
  });
  return { toPut, pinsToPut, added, updated, unchanged };
}

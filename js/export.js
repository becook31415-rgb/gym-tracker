// Export file building and backup merging. Pure functions, no DOM.
// The code that actually hands files to iOS lives in exporter.js.

import { toCSV } from './csv.js';
import { sortSessions } from './history.js';

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
  for (const s of sortSessions(real(sessions)).filter((x) => x.kind === 'workout')) {
    for (const ex of s.exercises || []) {
      if (ex.skipped || ex.type === 'cardio') continue;
      const sets = [...(ex.sets || [])].filter((st) => st.completed).sort((a, b) => a.set_number - b.set_number);
      for (const st of sets) {
        rows.push([s.session_id, s.date, s.week, s.day_name, ex.exercise_id, ex.name_performed, st.set_number,
          st.weight, st.unit || s.unit, ex.load_basis, ex.per_side, st.reps, st.rpe, st.set_note, s.session_notes, s.program_name]);
      }
    }
  }
  return rows;
}

// Standalone cardio sessions plus cardio exercises done inside a workout.
export function buildCardioRows(sessions) {
  const rows = [];
  for (const s of sortSessions(real(sessions))) {
    if (s.kind === 'cardio') {
      rows.push([s.session_id, s.date, s.start_time, s.cardio_type, s.duration_min, s.intensity_rpe, s.notes, 'standalone', '']);
    } else if (s.kind === 'workout') {
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
    sessions: r.filter((s) => s.kind === 'workout'),
    cardio_sessions: r.filter((s) => s.kind === 'cardio'),
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

export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 'This is not a workout-log backup file.';
  if (obj.app !== 'gym-tracker' || !Array.isArray(obj.sessions)) return 'This is not a workout-log backup file (expected a workout-log_….json exported by this app).';
  if (obj.schema_version !== LOG_SCHEMA_VERSION) return `This backup uses schema version ${obj.schema_version}, which this app does not understand.`;
  const all = [...obj.sessions, ...(obj.cardio_sessions || [])];
  for (const [i, s] of all.entries()) {
    if (!s || typeof s.session_id !== 'string' || !s.session_id) return `Session ${i + 1} has no session_id.`;
    if (s.kind !== 'workout' && s.kind !== 'cardio') return `Session ${i + 1} has an unknown kind.`;
  }
  return null;
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

// Gym Tracker: screens, routing and autosave.
// Every change is written to IndexedDB immediately; there is no "save" step to forget.

import * as db from './db.js';
import { parseNum, parseIntOrNull, displayNumber, loadBasisLabel, isBodyweightExercise, fmt } from './units.js';
import { pbFlags } from './pb.js';
import { lastPerformance, priorSets, prefillSet, formatSets, defaultVariant, lastSetupForName, namesUsed, variantOf,
  exUnit, setUnit, isFinished, nextUnloggedWeek, kindOf } from './history.js';
import { parseProgramText } from './program.js';
import { buildExportFiles, exportReminderDue, hasUnexported, localISO, localDate, checkBackup, mergeBackup } from './export.js';
import { exportFiles } from './exporter.js';
import { splitProgramName, weekCount, weekRangeLabel, weekForDate, sessionTitle, dateLabel } from './display.js';

export const APP_VERSION = '1.0.0';
export const BUILD = 'dev'; // replaced with the commit id by the deploy workflow
const CARDIO_TYPES = ['bike', 'run', 'row', 'walk', 'other'];

const state = {
  program: null,
  settings: { unit: 'kg', lastWeek: null, lastDay: null, lastExportAt: null },
  sessions: [],
  pins: [],
};

const app = document.getElementById('app');
let screen = {}; // event handlers of the current screen

// ---------- helpers ----------

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
const nowISO = () => localISO(new Date());
const shortDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};
const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');

function toast(msg, ms = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}

async function safely(promise) {
  try { await promise; }
  catch (e) { console.error(e); toast('⚠️ Could not save to storage: ' + (e && e.message), 6000); }
}

function saveSettings() { return safely(db.kvSet('settings', state.settings)); }

function saveSession(s) {
  const now = nowISO();
  if (!s.start_time) s.start_time = now;
  s.updated_at = now;
  const i = state.sessions.findIndex((x) => x.session_id === s.session_id);
  if (i < 0) state.sessions.push(s); else state.sessions[i] = s;
  return safely(db.put('sessions', s));
}

function header(title, back = true) {
  return `<header class="bar">
    ${back ? '<a class="back" href="#/">‹ Home</a>' : '<span></span>'}
    <h1>${esc(title)}</h1>
    <span class="offline" ${navigator.onLine ? 'hidden' : ''}>Offline</span>
  </header>`;
}

function mount(html, handlers = {}) {
  document.body.classList.remove('ios'); // Home adds it back after mounting
  app.innerHTML = html;
  screen = handlers;
  window.scrollTo(0, 0);
}

for (const type of ['click', 'input', 'change']) {
  app.addEventListener(type, (e) => screen[type] && screen[type](e));
}
// Select the whole value when a number field gets focus, so typing replaces it.
app.addEventListener('focusin', (e) => {
  const el = e.target;
  if (el.matches && el.matches('input.num')) setTimeout(() => { try { el.setSelectionRange(0, el.value.length); } catch {} }, 0);
});

// ---------- Home ----------

function weekOf(n) { return state.program.weeks.find((w) => w.week === n); }

function sessionFor(week, dayName) {
  const list = state.sessions.filter((s) => kindOf(s) === 'workout' && s.program_name === state.program.program_name && s.week === week && s.day_name === dayName);
  return list.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0] || null;
}

const ICON_NOTES = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v5h5M9 13h6M9 17h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const ICON_SLIDERS = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="15" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const ICON_CHEVRON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

let homeWeek = null; // week being viewed on Home this visit; null = pick the default

// Default: the week containing today; outside the program's dates, the last week you used.
function defaultHomeWeek() {
  const today = weekForDate(state.program, new Date());
  if (today !== null) return today;
  return weekOf(state.settings.lastWeek) ? state.settings.lastWeek : state.program.weeks[0].week;
}

function renderHome() {
  if (!state.program) {
    mount(`${header('Gym Tracker', false)}<main class="pad"><p>No program loaded yet.</p>
      <a class="btn primary" href="#/settings">Settings / Import program</a></main>`);
    return;
  }
  const p = state.program;
  if (!weekOf(homeWeek)) homeWeek = defaultHomeWeek();
  const weekNum = homeWeek;
  const week = weekOf(weekNum);
  const idx = p.weeks.indexOf(week);
  const total = weekCount(p);
  const { title, subtitle } = splitProgramName(p);
  const range = weekRangeLabel(p, weekNum);
  const reminder = exportReminderDue(state.sessions, state.settings.lastExportAt, new Date());

  const sessions = week.days.map((d) => sessionFor(weekNum, d.day_name));
  const upNext = sessions.findIndex((s) => !(s && isFinished(s)));

  const cards = week.days.map((d, i) => {
    const s = sessions[i];
    const done = !!(s && isFinished(s));
    const started = !!s && !done;
    const { title: focus, dayLabel } = sessionTitle(d.day_name, i);
    const label = dateLabel(d.scheduled_date) || dayLabel;
    const isNext = i === upNext;
    return `<a class="ios-card session ${done ? 'done' : ''} ${isNext ? 'next' : ''}" href="#/day/${weekNum}/${i}">
      <div class="session-row">
        <div class="session-text">
          <p class="caps ${isNext ? 'accent' : ''}">${isNext ? 'Up next · ' : ''}${esc(label)}</p>
          <p class="card-title">${esc(focus)}</p>
          <p class="meta">${esc(dayLabel)}${started ? ' · in progress' : ''}${done ? ' · completed' : ''}</p>
        </div>
        ${isNext ? '' : `<span class="trail ${done ? 'check' : ''}">${done ? ICON_CHECK : ICON_CHEVRON}</span>`}
      </div>
      ${isNext ? `<span class="start-btn">${started ? 'Continue session' : 'Start session'}</span>` : ''}
    </a>`;
  }).join('');

  mount(`<div class="ios-toolbar">
      <span class="offline" ${navigator.onLine ? 'hidden' : ''}>Offline</span>
      <span class="spacer"></span>
      <a class="icon-btn" href="#/notes" aria-label="Program notes">${ICON_NOTES}</a>
      <a class="icon-btn" href="#/settings" aria-label="Settings and export">${ICON_SLIDERS}</a>
    </div>
    <main class="ios-home">
      <h1 class="large-title">${esc(title)}</h1>
      ${subtitle ? `<p class="meta subtitle">${esc(subtitle)}</p>` : ''}
      ${reminder ? `<a class="ios-card reminder" href="#/settings"><p class="caps">Backup</p>
        <p class="card-title">Export your workouts</p><p class="meta">Not exported for over 7 days. Tap to export.</p></a>` : ''}
      <section class="ios-card week-card" aria-label="Week">
        <div class="week-nav">
          <button class="icon-btn chev prev" data-step="-1" aria-label="Previous week" ${idx === 0 ? 'disabled' : ''}>${ICON_CHEVRON}</button>
          <div class="week-center">
            <p class="card-title">Week ${weekNum} of ${total}</p>
            ${range ? `<p class="week-range">${esc(range)}</p>` : ''}
          </div>
          <button class="icon-btn chev" data-step="1" aria-label="Next week" ${idx === p.weeks.length - 1 ? 'disabled' : ''}>${ICON_CHEVRON}</button>
        </div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${weekNum}" aria-label="Week ${weekNum} of ${total}">
          <span style="width:${Math.min(100, (weekNum / total) * 100).toFixed(1)}%"></span>
        </div>
      </section>
      <p class="caps section-label">This week</p>
      ${cards}
      <a class="ios-card session cardio-card" href="#/cardio">
        <div class="session-row">
          <div class="session-text">
            <p class="caps">Any day</p>
            <p class="card-title">Log cardio</p>
          </div>
          <span class="plus-circle">${ICON_PLUS}</span>
        </div>
      </a>
    </main>`, {
    click(e) {
      const b = e.target.closest('button[data-step]');
      if (!b || b.disabled) return;
      homeWeek = p.weeks[idx + Number(b.dataset.step)].week;
      state.settings.lastWeek = homeWeek;
      saveSettings();
      renderHome();
    },
  });
  document.body.classList.add('ios');
}

// ---------- Workout ----------

let W = null; // current workout view: { week, dayIdx, day, exercises, session, openNotes:Set, openSetNotes:Set }

// The variant (name, load basis, unit) this card is logging: the stored entry's, or a default
// taken from the last time you did this exercise.
function variantFor(progEx) {
  const e = W.session.exercises.find((x) => x.exercise_id === progEx.exercise_id);
  return e ? variantOf(e, W.session) : defaultVariant(state.sessions, progEx, W.session, state.settings.unit);
}

function entryFor(progEx, create) {
  let e = W.session.exercises.find((x) => x.exercise_id === progEx.exercise_id);
  if (!e && create) {
    const v = defaultVariant(state.sessions, progEx, W.session, state.settings.unit);
    e = { exercise_id: progEx.exercise_id, name_performed: v.name_performed, skipped: false, exercise_note: null, pinned_note: null,
      load_basis: v.load_basis, unit: v.unit, per_side: progEx.per_side, type: progEx.type, order: progEx.order, sets: [], set_count: null };
    if (progEx.type === 'cardio') e.cardio = null;
    W.session.exercises.push(e);
    W.session.exercises.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }
  return e;
}

function saveWorkout() {
  state.settings.lastWeek = W.week;
  state.settings.lastDay = W.day.day_name;
  saveSettings();
  return saveSession(W.session);
}

// Logged exercises that are not in this program day (e.g. from an older program version)
// still get a card, so nothing logged is ever hidden.
function extraExercises(day, session) {
  const ids = day.exercises.map((e) => e.exercise_id);
  return session.exercises.filter((e) => !ids.includes(e.exercise_id)).map((e, i) => ({
    order: 1000 + i, exercise_id: e.exercise_id, name: e.name_performed || e.exercise_id, alternatives: [],
    type: e.type || (e.load_basis === 'added' ? 'bodyweight' : 'strength'), group: 'NOT IN THIS PROGRAM DAY',
    sets: e.sets.length || 1, sets_note: null, reps: null, target_weight: null, rpe: null, per_side: !!e.per_side,
    load_basis: e.load_basis || 'total', prescription_note: null, cues: null, progression: null, notes: null, superset_group: null, cardio: null,
  }));
}

function renderWorkout(week, dayIdx) {
  const wk = state.program && weekOf(week);
  const day = wk && wk.days[dayIdx];
  if (!day) { location.hash = '#/'; return; }
  let session = sessionFor(week, day.day_name);
  if (!session) {
    session = { session_id: uuid(), kind: 'workout', date: localDate(new Date()), start_time: null, end_time: null,
      program_name: state.program.program_name, week, day_name: day.day_name, unit: state.settings.unit,
      session_notes: null, exercises: [], updated_at: null };
  } else {
    session = structuredClone(session);
  }
  W = { week, dayIdx, day, exercises: [...day.exercises, ...extraExercises(day, session)], session, openNotes: new Set(), openSetNotes: new Set() };

  let lastGroup = null;
  const cards = W.exercises.map((ex, i) => {
    let heading = '';
    if (ex.group && ex.group !== lastGroup) heading = `<h2 class="group">${esc(ex.group)}</h2>`;
    lastGroup = ex.group || lastGroup;
    return heading + cardHTML(i);
  }).join('');

  mount(`${header(`Week ${week}`)}
    <main class="pad workout">
      <h1 class="day-title">${esc(day.day_name)}</h1>
      <label class="inline">Date <input type="date" id="session-date" value="${esc(session.date)}"></label>
      <div id="finish-status">${finishStatus()}</div>
      ${cards}
      <section class="session-notes">
        <label for="session-notes">Session notes</label>
        <textarea id="session-notes" rows="3" placeholder="How did it go?">${esc(session.session_notes)}</textarea>
      </section>
      <button class="btn primary big" id="finish">${session.end_time ? 'Update finish time' : 'Finish workout'}</button>
      <div id="after-finish"></div>
    </main>`, { click: workoutClick, input: workoutInput, change: workoutChange });
}

function finishStatus() {
  const s = W.session;
  if (s.end_time) return `<p class="status done-status">Finished ${esc(timeOf(s.end_time))}. Edits still save automatically.</p>`;
  if (s.start_time) return `<p class="status">Started ${esc(timeOf(s.start_time))} · saved automatically</p>`;
  if (state.sessions.some((x) => x.session_id === s.session_id)) return '<p class="status done-status">Imported log. Edits save automatically.</p>';
  return '';
}

function rowCount(progEx, entry) {
  const stored = entry ? Math.max(0, ...entry.sets.map((s) => s.set_number)) : 0;
  if (entry && entry.set_count != null) return Math.max(entry.set_count, 0);
  return Math.max(progEx.sets || 1, stored);
}

function prescription(ex) {
  if (ex.type === 'cardio' && ex.cardio) {
    return [ex.cardio.cardio_type, ex.cardio.duration_min != null ? `${ex.cardio.duration_min} min` : null, ex.cardio.intensity].filter(Boolean).join(' · ');
  }
  let t = '';
  if (ex.sets && ex.reps) t = `${ex.sets} x ${ex.reps}`;
  else if (ex.sets) t = `${ex.sets} sets`;
  else if (ex.reps) t = ex.reps;
  if (ex.per_side && t) t += ' per side';
  if (ex.rpe) t += `${t ? ' @ ' : ''}RPE ${ex.rpe}`;
  if (ex.sets_note) t += `${t ? ' · ' : ''}${ex.sets_note}`;
  return t;
}

const BASIS_NAMES = { total: 'total', per_hand: 'per hand', per_side: 'per side', added: 'added to BW', assist: 'assistance' };

function cardHTML(i) {
  const ex = W.exercises[i];
  const entry = entryFor(ex, false);
  const skipped = !!(entry && entry.skipped);
  const v = variantFor(ex);
  const unit = v.unit;
  const meta = { type: ex.type, load_basis: v.load_basis };
  const bw = isBodyweightExercise(meta);
  const pins = state.pins.filter((p) => p.exercise_id === ex.exercise_id && p.source_session_id !== W.session.session_id);
  const lp = lastPerformance(state.sessions, v, W.session);
  const lastText = lp.last ? formatSets(lp.last.ex, lp.last.session, unit) : '';
  const names = [...new Set([ex.name, ...ex.alternatives, ...namesUsed(state.sessions, ex.exercise_id), v.name_performed])];
  const basisLabel = v.load_basis !== 'total' || bw || unit !== 'kg' ? loadBasisLabel(v.load_basis, unit) : '';

  let body = '';
  let anyPb = false;
  if (skipped) {
    body = '<p class="skipped-msg">Skipped. Tap "Skipped" again to undo.</p>';
  } else if (ex.type === 'cardio') {
    body = cardioRowHTML(ex, entry);
  } else {
    const n = rowCount(ex, entry);
    const stored = entry ? entry.sets : [];
    const ordered = Array.from({ length: n }, (_, k) => stored.find((s) => s.set_number === k + 1) || null);
    const prior = priorSets(state.sessions, v, W.session);
    const flags = pbFlags(prior, ordered.map((s) => s && { ...s, unit: setUnit(s, entry, W.session) }),
      { bodyweight: bw, lowerIsBetter: v.load_basis === 'assist' });
    anyPb = flags.some(Boolean);
    const rows = ordered.map((st, k) => setRowHTML(ex, entry, k, st, flags[k], lp, bw, unit)).join('');
    body = `<div class="set-hdr"><span>Set</span><span>${esc(bw ? `+${unit}` : loadBasisLabel(v.load_basis, unit))}</span>
        <span>${ex.per_side ? 'Reps/side' : 'Reps'}</span><span>RPE</span><span></span></div>
      ${rows}
      <button class="btn small add-set" data-act="add-set">+ Add set</button>`;
  }

  const ownPin = state.pins.find((p) => p.source_session_id === W.session.session_id && p.exercise_id === ex.exercise_id);
  const setup = ex.type === 'cardio' ? '' : `<h3>Setup for this exercise</h3>
      <div class="setup">
        <label>Unit <select data-field="setup-unit">${['kg', 'lb'].map((u) => `<option ${u === unit ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
        <label>Weight is <select data-field="setup-basis">${Object.entries(BASIS_NAMES).map(([k, t]) => `<option value="${k}" ${k === v.load_basis ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <p class="muted small">Pick what the number means on this machine. "Last" and PBs only compare like with like.</p>`;
  return `<section class="ex ${skipped ? 'is-skipped' : ''}" data-ex="${i}" id="ex-${i}">
    <div class="ex-head">
      <h2 class="ex-name">${esc(v.name_performed)}${anyPb ? ' <span class="pb-badge">PB</span>' : ''}</h2>
      <button class="btn small skip ${skipped ? 'on' : ''}" data-act="skip" aria-pressed="${skipped}">${skipped ? 'Skipped' : 'Skip'}</button>
    </div>
    ${names.length > 1 ? `<label class="alt">Doing: <select data-field="alt">${names.map((nm) => `<option ${nm === v.name_performed ? 'selected' : ''}>${esc(nm)}</option>`).join('')}</select></label>` : ''}
    <p class="rx">${esc(prescription(ex))}${basisLabel ? ` · <span class="basis">${esc(basisLabel)}</span>` : ''}${ex.superset_group ? ` · Superset ${esc(ex.superset_group)}` : ''}</p>
    ${ex.prescription_note ? `<p class="rx-note">${esc(ex.prescription_note)}</p>` : ''}
    ${lastText ? `<p class="last">Last: ${esc(lastText)} <span class="muted">(${esc(shortDate(lp.last.session.date))})</span></p>` : ''}
    ${lp.skippedLastTime ? `<p class="last muted">Skipped last time (${esc(shortDate(lp.skippedDate))})</p>` : ''}
    ${pins.map((p) => `<p class="pin">📌 ${esc(p.text)}</p>`).join('')}
    ${body}
    <details class="notes" ${W.openNotes.has(i) ? 'open' : ''} data-act="notes">
      <summary>Notes &amp; cues${pins.length ? ` (📌${pins.length})` : ''}</summary>
      ${ex.cues ? `<h3>Cues</h3><p>${esc(ex.cues)}</p>` : ''}
      ${ex.progression ? `<h3>Progression</h3><p>${esc(ex.progression)}</p>` : ''}
      ${ex.notes ? `<h3>Notes</h3><p>${esc(ex.notes)}</p>` : ''}
      ${pins.length ? `<h3>Pinned reminders</h3>${pins.map((p) => `<div class="pin-edit">
          <textarea rows="2" data-field="pin" data-pin="${esc(p.id)}">${esc(p.text)}</textarea>
          <button class="btn small" data-act="unpin" data-pin="${esc(p.id)}">Remove</button></div>`).join('')}` : ''}
      <h3>Note for this session</h3>
      <textarea rows="2" data-field="ex-note" placeholder="e.g. Bring chalk">${esc(entry && entry.exercise_note)}</textarea>
      <label class="check"><input type="checkbox" data-field="pin-toggle" ${ownPin ? 'checked' : ''}> Pin to this exercise (shows in future sessions)</label>
      ${setup}
    </details>
  </section>`;
}

function setRowHTML(ex, entry, k, st, isPb, lp, bw, unit) {
  let w; let r; let rpe = ''; let note = ''; let prefill = false;
  if (st) {
    w = fmt(displayNumber(st.weight, setUnit(st, entry, W.session), unit));
    r = st.reps ?? '';
    rpe = st.rpe ?? '';
    note = st.set_note || '';
  } else {
    const pf = prefillSet(k, lp.last && lp.last.ex, lp.last && lp.last.session, ex, state.program.units, unit);
    w = bw && !pf.weight ? '' : fmt(pf.weight);
    r = pf.reps ?? '';
    prefill = true;
  }
  const doneCls = st && st.completed ? 'done' : '';
  const open = W.openSetNotes.has(`${ex.exercise_id}:${k}`);
  return `<div class="set-row ${prefill ? 'prefill' : ''} ${doneCls}" data-set="${k}">
    <button class="set-num ${note ? 'has-note' : ''}" data-act="set-note" aria-label="Set ${k + 1}: note and remove">${k + 1}</button>
    <input class="num w" data-field="weight" inputmode="decimal" autocomplete="off" value="${esc(w)}" placeholder="${bw ? 'BW' : ''}" aria-label="Weight set ${k + 1}">
    <input class="num r" data-field="reps" inputmode="numeric" autocomplete="off" value="${esc(r)}" aria-label="Reps set ${k + 1}">
    <input class="num rpe" data-field="rpe" inputmode="decimal" autocomplete="off" value="${esc(rpe)}" aria-label="RPE set ${k + 1}">
    <button class="tick ${isPb ? 'pb' : ''}" data-act="tick" aria-pressed="${!!(st && st.completed)}" aria-label="Confirm set ${k + 1}">${isPb ? 'PB' : '✓'}</button>
    <div class="set-extra" ${open ? '' : 'hidden'}>
      <input class="set-note" data-field="set-note" value="${esc(note)}" placeholder="Set note (e.g. purple band)" autocomplete="off">
      <button class="btn small danger" data-act="remove-set">Remove set</button>
    </div>
  </div>`;
}

function cardioRowHTML(ex, entry) {
  const c = (entry && entry.cardio) || null;
  const type = c ? c.cardio_type : (ex.cardio && ex.cardio.cardio_type) || 'bike';
  const dur = c ? c.duration_min : (ex.cardio && ex.cardio.duration_min);
  const rpe = c ? c.intensity_rpe : null;
  return `<div class="cardio-row ${c ? '' : 'prefill'} ${c && c.completed ? 'done' : ''}">
    <label>Type <select data-field="c-type">${cardioOptions(type)}</select></label>
    <label>Minutes <input class="num" data-field="c-dur" inputmode="decimal" value="${esc(fmt(dur))}"></label>
    <label>RPE <input class="num" data-field="c-rpe" inputmode="decimal" value="${esc(rpe ?? '')}"></label>
    <button class="tick" data-act="c-tick" aria-pressed="${!!(c && c.completed)}" aria-label="Mark done">✓</button>
  </div>`;
}

function cardioOptions(selected) {
  const list = CARDIO_TYPES.includes(selected) || !selected ? CARDIO_TYPES : [...CARDIO_TYPES, selected];
  return list.map((t) => `<option value="${esc(t)}" ${t === selected ? 'selected' : ''}>${esc(t)}</option>`).join('');
}

function rerenderCard(i) {
  const el = document.getElementById(`ex-${i}`);
  if (el) el.outerHTML = cardHTML(i);
  const fs = document.getElementById('finish-status');
  if (fs) fs.innerHTML = finishStatus();
}

// Read a set row's current inputs into the stored set (creating it if needed).
// New or re-typed weights are stored in the unit this exercise is being logged in.
function syncSet(i, k, changedField) {
  const ex = W.exercises[i];
  const entry = entryFor(ex, true);
  const unit = exUnit(entry, W.session);
  const row = document.querySelector(`#ex-${i} .set-row[data-set="${k}"]`);
  const val = (f) => row.querySelector(`[data-field="${f}"]`).value;
  let st = entry.sets.find((s) => s.set_number === k + 1);
  if (!st) {
    st = { set_number: k + 1, weight: parseNum(val('weight')), unit, reps: parseIntOrNull(val('reps')),
      rpe: parseNum(val('rpe')), set_note: val('set-note').trim() || null, completed: false };
    entry.sets.push(st);
    entry.sets.sort((a, b) => a.set_number - b.set_number);
    if (entry.set_count == null) entry.set_count = rowCount(ex, entry);
  } else if (changedField === 'weight') {
    st.weight = parseNum(val('weight'));
    st.unit = unit;
  } else if (changedField === 'reps') st.reps = parseIntOrNull(val('reps'));
  else if (changedField === 'rpe') st.rpe = parseNum(val('rpe'));
  else if (changedField === 'set-note') st.set_note = val('set-note').trim() || null;
  row.classList.remove('prefill');
  return st;
}

function workoutClick(e) {
  if (e.target.closest('summary')) {
    const i = Number(e.target.closest('.ex').dataset.ex);
    // toggle state is read after the browser flips it
    setTimeout(() => { const d = document.querySelector(`#ex-${i} details`); if (d && d.open) W.openNotes.add(i); else W.openNotes.delete(i); });
    return;
  }
  const btn = e.target.closest('[data-act]');
  if (btn && btn.id !== 'finish') {
    const card = btn.closest('.ex');
    const i = card ? Number(card.dataset.ex) : null;
    const ex = i !== null ? W.exercises[i] : null;
    const rowEl = btn.closest('.set-row');
    const k = rowEl ? Number(rowEl.dataset.set) : null;
    switch (btn.dataset.act) {
      case 'tick': {
        const st = syncSet(i, k, null);
        st.completed = !st.completed;
        saveWorkout();
        rerenderCard(i);
        break;
      }
      case 'set-note': {
        const key = `${ex.exercise_id}:${k}`;
        const extra = rowEl.querySelector('.set-extra');
        extra.hidden = !extra.hidden;
        if (extra.hidden) W.openSetNotes.delete(key); else { W.openSetNotes.add(key); extra.querySelector('input').focus(); }
        break;
      }
      case 'remove-set': {
        const entry = entryFor(ex, true);
        const n = rowCount(ex, entry);
        entry.sets = entry.sets.filter((s) => s.set_number !== k + 1);
        entry.sets.forEach((s) => { if (s.set_number > k + 1) s.set_number -= 1; });
        entry.set_count = Math.max(0, n - 1);
        W.openSetNotes.clear();
        saveWorkout();
        rerenderCard(i);
        break;
      }
      case 'add-set': {
        const entry = entryFor(ex, true);
        entry.set_count = rowCount(ex, entry) + 1;
        saveWorkout();
        rerenderCard(i);
        break;
      }
      case 'skip': {
        const entry = entryFor(ex, true);
        entry.skipped = !entry.skipped;
        saveWorkout();
        rerenderCard(i);
        break;
      }
      case 'c-tick': {
        const entry = entryFor(ex, true);
        syncCardio(i, entry);
        entry.cardio.completed = !entry.cardio.completed;
        saveWorkout();
        rerenderCard(i);
        break;
      }
      case 'unpin': {
        removePin(btn.dataset.pin);
        rerenderCard(i);
        break;
      }
      default:
    }
    return;
  }
  if (e.target.id === 'finish') finishWorkout();
  if (e.target.id === 'export-now') doExport(e.target);
  if (e.target.id === 'not-now') location.hash = '#/';
}

function syncCardio(i, entry) {
  const card = document.getElementById(`ex-${i}`);
  const v = (f) => card.querySelector(`[data-field="${f}"]`).value;
  const prev = entry.cardio || { completed: false };
  entry.cardio = { cardio_type: v('c-type'), duration_min: parseNum(v('c-dur')), intensity_rpe: parseNum(v('c-rpe')), completed: prev.completed };
  card.querySelector('.cardio-row').classList.remove('prefill');
}

function workoutInput(e) {
  const t = e.target;
  if (t.id === 'session-notes') { W.session.session_notes = t.value || null; saveWorkout(); return; }
  const f = t.dataset.field;
  if (!f) return;
  const i = Number(t.closest('.ex').dataset.ex);
  const ex = W.exercises[i];
  if (['weight', 'reps', 'rpe', 'set-note'].includes(f)) {
    syncSet(i, Number(t.closest('.set-row').dataset.set), f);
    if (f === 'set-note') t.closest('.set-row').querySelector('.set-num').classList.toggle('has-note', !!t.value.trim());
    saveWorkout();
  } else if (f === 'c-dur' || f === 'c-rpe') {
    syncCardio(i, entryFor(ex, true));
    saveWorkout();
  } else if (f === 'ex-note') {
    const entry = entryFor(ex, true);
    entry.exercise_note = t.value || null;
    const own = state.pins.find((p) => p.source_session_id === W.session.session_id && p.exercise_id === ex.exercise_id);
    if (own) { own.text = t.value; own.updated_at = nowISO(); entry.pinned_note = t.value || null; safely(db.put('pins', own)); }
    saveWorkout();
  } else if (f === 'pin') {
    const pin = state.pins.find((p) => p.id === t.dataset.pin);
    if (pin) { pin.text = t.value; pin.updated_at = nowISO(); safely(db.put('pins', pin)); }
  }
}

function workoutChange(e) {
  const t = e.target;
  if (t.id === 'session-date') {
    if (t.value) { W.session.date = t.value; saveWorkout(); }
    return;
  }
  const f = t.dataset.field;
  if (!f) return;
  const i = Number(t.closest('.ex').dataset.ex);
  const ex = W.exercises[i];
  const entry = entryFor(ex, true);
  if (f === 'alt') {
    // Switching to an alternative also switches to the setup you last used for it.
    entry.name_performed = t.value;
    const setup = lastSetupForName(state.sessions, ex.exercise_id, t.value, W.session);
    if (setup) { entry.load_basis = setup.load_basis; entry.unit = setup.unit; }
    saveWorkout(); rerenderCard(i);
  } else if (f === 'setup-unit') { entry.unit = t.value; saveWorkout(); rerenderCard(i); }
  else if (f === 'setup-basis') { entry.load_basis = t.value; saveWorkout(); rerenderCard(i); }
  else if (f === 'c-type') { syncCardio(i, entry); saveWorkout(); }
  else if (f === 'pin-toggle') {
    const id = `${W.session.session_id}:${ex.exercise_id}`;
    if (t.checked) {
      const pin = { id, exercise_id: ex.exercise_id, text: entry.exercise_note || '', source_session_id: W.session.session_id, created_at: nowISO(), updated_at: nowISO() };
      if (W.session.demo) pin.demo = true;
      state.pins.push(pin);
      entry.pinned_note = pin.text || null;
      safely(db.put('pins', pin));
      if (!pin.text) toast('Pinned. Type the note above and it will show next time.');
    } else {
      removePin(id);
      entry.pinned_note = null;
    }
    saveWorkout();
  }
}

function removePin(id) {
  state.pins = state.pins.filter((p) => p.id !== id);
  for (const s of state.sessions) {
    if (id.startsWith(s.session_id + ':')) {
      const ex = s.exercises.find((x) => id === `${s.session_id}:${x.exercise_id}`);
      if (ex) { ex.pinned_note = null; safely(db.put('sessions', s)); }
    }
  }
  if (W && id.startsWith(W.session.session_id + ':')) {
    const ex = W.session.exercises.find((x) => id === `${W.session.session_id}:${x.exercise_id}`);
    if (ex) ex.pinned_note = null;
  }
  safely(db.del('pins', id));
}

async function finishWorkout() {
  W.session.end_time = nowISO();
  await saveWorkout();
  document.getElementById('finish').textContent = 'Update finish time';
  document.getElementById('finish-status').innerHTML = finishStatus();
  const real = state.sessions.some((s) => !s.demo);
  document.getElementById('after-finish').innerHTML = `<div class="card">
    <p><strong>Workout saved.</strong>${real ? ' Export your data now?' : ''}</p>
    ${real ? '<button class="btn primary" id="export-now">Export / Save to Files</button>' : ''}
    <button class="btn" id="not-now">${real ? 'Not now' : 'Back to Home'}</button></div>`;
  document.getElementById('after-finish').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------- Export (shared by Settings and after-finish) ----------

// Must run straight from the tap: builds files from memory and calls the share sheet at once.
function doExport(button) {
  const files = buildExportFiles(state.sessions, state.pins, new Date());
  const realCount = state.sessions.filter((s) => !s.demo).length;
  if (!realCount) { toast('Nothing to export yet (demo data is never exported).'); return; }
  if (button) button.disabled = true;
  exportFiles(files).then((result) => {
    if (result === 'cancelled') { toast('Export cancelled. Nothing was marked as exported.'); return; }
    state.settings.lastExportAt = nowISO();
    saveSettings();
    toast(result === 'shared' ? 'Exported 3 files.' : 'Downloaded 3 files.');
    if (onSettings()) renderSettings();
  }).catch((e) => {
    console.error(e);
    toast('Export failed: ' + (e && e.message), 6000);
  }).finally(() => { if (button) button.disabled = false; });
}

// ---------- Cardio ----------

let C = null;

function renderCardio(id) {
  const existing = id && state.sessions.find((s) => s.session_id === id && kindOf(s) === 'cardio');
  C = existing ? structuredClone(existing)
    : { session_id: uuid(), kind: 'cardio', date: localDate(new Date()), start_time: null, cardio_type: 'bike', duration_min: null, intensity_rpe: null, notes: null, updated_at: null };
  const recent = state.sessions.filter((s) => kindOf(s) === 'cardio').sort((a, b) => (a.start_time < b.start_time ? 1 : -1)).slice(0, 8);
  mount(`${header('Cardio')}
    <main class="pad">
      <form class="stack" onsubmit="return false">
        <label>Date <input type="date" id="c-date" value="${esc(C.date)}"></label>
        <label>Type <select id="c-type">${cardioOptions(C.cardio_type)}</select></label>
        <label>Duration (minutes) <input class="num" id="c-dur" inputmode="decimal" value="${esc(fmt(C.duration_min))}"></label>
        <label>Intensity / RPE (1-10) <input class="num" id="c-rpe" inputmode="decimal" value="${esc(C.intensity_rpe ?? '')}"></label>
        <label>Notes <textarea id="c-notes" rows="3">${esc(C.notes)}</textarea></label>
        <p class="muted small">Saves automatically as you type.</p>
        <button class="btn primary" id="c-save">${existing ? 'Done' : 'Save cardio'}</button>
        ${existing ? '<button class="btn danger" id="c-delete">Delete this cardio session</button>' : ''}
      </form>
      ${recent.length ? `<h2>Recent cardio</h2><ul class="list">${recent.map((s) => `<li><a href="#/cardio/${esc(s.session_id)}">
        ${esc(shortDate(s.date))} · ${esc(s.cardio_type)} · ${esc(fmt(s.duration_min))} min${s.intensity_rpe != null ? ` · RPE ${esc(s.intensity_rpe)}` : ''}${s.demo ? ' · demo' : ''}</a></li>`).join('')}</ul>` : ''}
    </main>`, {
    input: cardioSync,
    change: cardioSync,
    click(e) {
      if (e.target.id === 'c-save') {
        const v = (id) => document.getElementById(id).value.trim();
        if (!C.updated_at && !v('c-dur') && !v('c-rpe') && !v('c-notes')) { toast('Nothing entered, so nothing saved.'); location.hash = '#/'; return; }
        cardioSync();
        toast('Cardio saved.');
        location.hash = '#/';
      } else if (e.target.id === 'c-delete') {
        if (confirm('Delete this cardio session? This cannot be undone.')) {
          state.sessions = state.sessions.filter((s) => s.session_id !== C.session_id);
          safely(db.del('sessions', C.session_id));
          location.hash = '#/';
        }
      }
    },
  });
}

function cardioSync() {
  const v = (id) => document.getElementById(id).value;
  C.date = v('c-date') || C.date;
  C.cardio_type = v('c-type');
  C.duration_min = parseNum(v('c-dur'));
  C.intensity_rpe = parseNum(v('c-rpe'));
  C.notes = v('c-notes') || null;
  saveSession(C);
}

// ---------- Program notes ----------

function renderNotes() {
  const notes = (state.program && state.program.program_notes) || [];
  mount(`${header('Program notes')}
    <main class="pad">
      ${notes.length ? notes.map((n) => `<details class="note-sec"><summary>${esc(n.title)}</summary><p>${esc(n.body).replace(/\n/g, '<br>')}</p></details>`).join('')
        : '<p>This program has no notes.</p>'}
    </main>`);
}

// ---------- Settings ----------

const onSettings = () => location.hash.startsWith('#/settings');

async function renderSettings() {
  const s = state.settings;
  let persisted = 'unknown (not supported)';
  try { if (navigator.storage && navigator.storage.persisted) persisted = (await navigator.storage.persisted()) ? 'yes' : 'no'; } catch {}
  if (!onSettings()) return; // user navigated away while we waited
  const realCount = state.sessions.filter((x) => !x.demo).length;
  const demoCount = state.sessions.filter((x) => x.demo).length;
  const unexported = hasUnexported(state.sessions, s.lastExportAt);

  mount(`${header('Settings')}
    <main class="pad settings">
      <section class="card">
        <h2>Units</h2>
        <div class="seg" role="group" aria-label="Units">
          ${['kg', 'lb'].map((u) => `<button class="btn ${s.unit === u ? 'on' : ''}" data-unit="${u}" aria-pressed="${s.unit === u}">${u}</button>`).join('')}
        </div>
        <p class="muted small">Default unit for exercises you haven't logged yet. An exercise logged in lb (e.g. an assist machine) stays in lb; change it under that exercise's "Notes &amp; cues → Setup". Stored weights are never converted.</p>
      </section>

      <section class="card">
        <h2>Export data</h2>
        <p>Last exported: <strong>${s.lastExportAt ? esc(new Date(s.lastExportAt).toLocaleString()) : 'never'}</strong>${unexported ? ' · <span class="warn-text">new data not exported</span>' : ''}</p>
        <p class="muted small">${realCount} sessions logged. Creates 3 files; choose "Save to Files" then your OneDrive folder.</p>
        <button class="btn primary" id="export">Export / Save to Files</button>
      </section>

      <section class="card">
        <h2>Import program</h2>
        <p>Current: <strong>${esc(state.program ? state.program.program_name : 'none')}</strong></p>
        <label class="btn file-btn">Choose .json or .csv file<input type="file" id="prog-file" accept=".json,.csv,application/json,text/csv,text/plain" hidden></label>
        <label for="prog-paste">…or paste JSON / CSV</label>
        <textarea id="prog-paste" rows="4" placeholder='{ "schema_version": 1, ... }'></textarea>
        <button class="btn" id="prog-paste-go">Import pasted text</button>
        <div id="import-result"></div>
        <p class="small">Templates: <a href="templates/program-template.json" download>JSON</a> · <a href="templates/program-template.csv" download>CSV</a></p>
      </section>

      <section class="card">
        <h2>Restore from backup</h2>
        <p class="muted small">Pick a workout-log_….json export. Sessions are merged by ID, so nothing is duplicated.</p>
        <label class="btn file-btn">Choose backup file<input type="file" id="backup-file" accept=".json,application/json" hidden></label>
        <div id="restore-result"></div>
      </section>

      <section class="card">
        <h2>Demo data</h2>
        <p class="muted small">Made-up sessions for the sample program, marked as demo. Never exported.${demoCount ? ` Loaded: ${demoCount}.` : ''}</p>
        <button class="btn" id="demo-load">Load demo data</button>
        <button class="btn" id="demo-clear">Clear demo data</button>
      </section>

      <section class="card">
        <h2>Storage</h2>
        <p>Persistent storage granted: <strong>${persisted}</strong></p>
        ${persisted === 'no' ? '<button class="btn" id="persist">Ask again</button>' : ''}
        <p class="muted small">App version ${APP_VERSION} (build ${BUILD})</p>
      </section>
    </main>`, { click: settingsClick, change: settingsChange });
}

function settingsClick(e) {
  const t = e.target;
  if (t.dataset.unit) {
    state.settings.unit = t.dataset.unit;
    saveSettings();
    renderSettings();
  } else if (t.id === 'export') doExport(t);
  else if (t.id === 'prog-paste-go') importProgram(document.getElementById('prog-paste').value, '');
  else if (t.id === 'demo-load') loadDemo();
  else if (t.id === 'demo-clear') clearDemo();
  else if (t.id === 'persist') navigator.storage.persist().then(() => renderSettings());
}

function settingsChange(e) {
  const t = e.target;
  if (t.id === 'prog-file' && t.files[0]) {
    const f = t.files[0];
    f.text().then((txt) => importProgram(txt, f.name));
    t.value = '';
  } else if (t.id === 'backup-file' && t.files[0]) {
    t.files[0].text().then(restoreBackup);
    t.value = '';
  }
}

async function importProgram(text, filename) {
  const out = document.getElementById('import-result');
  const r = parseProgramText(text, filename);
  if (!r.ok) {
    out.innerHTML = `<div class="errors"><p><strong>Not imported.</strong> Fix these and try again:</p><ul>${r.errors.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>`;
    return;
  }
  const p = r.program;
  const days = p.weeks.reduce((n, w) => n + w.days.length, 0);
  if (state.program && !confirm(`Replace "${state.program.program_name}" with "${p.program_name}" (${p.weeks.length} weeks, ${days} days)?\n\nYour logged history is kept.`)) return;
  state.program = p;
  await safely(db.kvSet('program', p));
  const wk = openNextWeek();
  await saveSettings();
  out.innerHTML = `<p class="ok-text">Imported "${esc(p.program_name)}": ${p.weeks.length} weeks, ${days} days. Home now opens on Week ${wk}.</p>`;
  document.getElementById('prog-paste').value = '';
}

// Point Home at the next week you haven't logged (Day 1), e.g. Week 7 after weeks 1-6.
function openNextWeek() {
  homeWeek = null;
  const wk = nextUnloggedWeek(state.program, state.sessions);
  state.settings.lastWeek = wk;
  state.settings.lastDay = weekOf(wk).days[0].day_name;
  return wk;
}

async function restoreBackup(text) {
  const out = document.getElementById('restore-result');
  let obj;
  try { obj = JSON.parse(text); } catch (e) { out.innerHTML = `<p class="warn-text">Not valid JSON: ${esc(e.message)}</p>`; return; }
  const r = checkBackup(obj);
  if (r.errors.length) {
    out.innerHTML = `<div class="errors"><p><strong>Nothing restored.</strong> Problems found:</p><ul>${r.errors.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>`;
    return;
  }
  const m = mergeBackup(state.sessions, state.pins, r.backup);
  await safely(db.putMany('sessions', m.toPut));
  await safely(db.putMany('pins', m.pinsToPut));
  await loadData();
  const wk = state.program ? openNextWeek() : null;
  await saveSettings();
  out.innerHTML = `<p class="ok-text">Restored: ${m.added} added, ${m.updated} updated, ${m.unchanged} already here
    (file had ${r.counts.sessions} workouts, ${r.counts.cardio} cardio, ${r.counts.sets} sets).${wk ? ` Home now opens on Week ${wk}.` : ''}</p>
    ${r.warnings.length ? `<ul class="small muted">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
}

async function loadDemo() {
  try {
    const h = checkBackup(await (await fetch('data/sample-history.json')).json());
    if (!h.backup) throw new Error(h.errors[0]);
    const m = mergeBackup(state.sessions, state.pins, h.backup);
    await db.putMany('sessions', m.toPut);
    await db.putMany('pins', m.pinsToPut);
    await loadData();
    toast(`Demo data loaded (${m.added} sessions).`);
    if (onSettings()) renderSettings();
  } catch (e) { toast('Could not load demo data: ' + e.message, 6000); }
}

async function clearDemo() {
  const ids = state.sessions.filter((s) => s.demo).map((s) => s.session_id);
  const pinIds = state.pins.filter((p) => p.demo).map((p) => p.id);
  await safely(db.delMany('sessions', ids));
  await safely(db.delMany('pins', pinIds));
  await loadData();
  toast(`Removed ${ids.length} demo sessions.`);
  if (onSettings()) renderSettings();
}

// ---------- startup ----------

async function loadData() {
  state.sessions = await db.getAll('sessions');
  state.pins = await db.getAll('pins');
}

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  switch (parts[0]) {
    case 'day': return renderWorkout(Number(parts[1]), Number(parts[2]));
    case 'cardio': return renderCardio(parts[1]);
    case 'notes': return renderNotes();
    case 'settings': return renderSettings();
    default: return renderHome();
  }
}

function updateOnline() {
  document.querySelectorAll('.offline').forEach((el) => { el.hidden = navigator.onLine; });
}

async function start() {
  try {
    state.settings = { ...state.settings, ...(await db.kvGet('settings', {})) };
    state.program = await db.kvGet('program', null);
    await loadData();
    if (!state.program) {
      const r = parseProgramText(await (await fetch('data/sample-program.json')).text(), 'sample-program.json');
      if (r.ok) { state.program = r.program; await db.kvSet('program', r.program); }
    }
    if (!(await db.kvGet('persistRequested', false)) && navigator.storage && navigator.storage.persist) {
      await db.kvSet('persistRequested', true);
      navigator.storage.persist().catch(() => {});
    }
  } catch (e) {
    console.error(e);
    app.innerHTML = `<main class="pad"><p class="warn-text">Storage could not be opened: ${esc(e.message)}</p></main>`;
    return;
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
  route();
}

// ---------- service worker + update banner ----------

function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const banner = document.getElementById('update-banner');
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const show = (worker) => {
      banner.hidden = false;
      banner.onclick = () => worker.postMessage('SKIP_WAITING');
    };
    if (reg.waiting && navigator.serviceWorker.controller) show(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) show(w);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {});
    });
  }).catch((e) => console.warn('Service worker registration failed', e));
}

start();
setupServiceWorker();

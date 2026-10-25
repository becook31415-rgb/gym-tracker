// Display helpers for the Home screen: titles, date labels and week ranges.
// Pure functions, no DOM. They only format; stored program data is never changed.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_RE = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?';
// "Sep-Nov 2026", "Sep 2026 - Jan 2027", "Oct 2026" at the end of a name
const TRAILING_DATES = new RegExp(`\\s*[-–—,(]?\\s*(${MONTH_RE}(?:\\s+\\d{4})?\\s*[-–—]\\s*${MONTH_RE}\\s+\\d{4}|${MONTH_RE}\\s+\\d{4})\\)?\\s*$`, 'i');

// "YYYY-MM-DD" -> Date at local midnight (no timezone surprises)
export function parseDate(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayMonth = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

function monthSpan(a, b) {
  if (a.getFullYear() !== b.getFullYear()) return `${MONTHS[a.getMonth()]} ${a.getFullYear()}–${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  if (a.getMonth() === b.getMonth()) return `${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  return `${MONTHS[a.getMonth()]}–${MONTHS[b.getMonth()]} ${a.getFullYear()}`;
}

/**
 * "Power Block Sep-Nov 2026" -> { title: "Power Block", subtitle: "Sep–Nov 2026" }.
 * Without dates in the name, the subtitle comes from start_date + duration_weeks (or is empty).
 */
export function splitProgramName(program) {
  const name = (program.program_name || '').trim();
  const m = name.match(TRAILING_DATES);
  if (m && m.index > 0) {
    return { title: name.slice(0, m.index).replace(/[\s\-–—,]+$/, ''), subtitle: m[1].replace(/\s*[-–—]\s*/, '–') };
  }
  const range = programRange(program);
  return { title: name, subtitle: range ? monthSpan(range.start, range.end) : '' };
}

function programRange(program) {
  const start = parseDate(program.start_date);
  const weeks = weekCount(program);
  if (start) return { start, end: addDays(start, weeks * 7 - 1) };
  const all = program.weeks.flatMap((w) => w.days.map((d) => parseDate(d.scheduled_date))).filter(Boolean).sort((a, b) => a - b);
  return all.length ? { start: all[0], end: all[all.length - 1] } : null;
}

// N in "Week X of N": the program's own length, never less than its highest week number.
export function weekCount(program) {
  const maxWeek = Math.max(...program.weeks.map((w) => w.week));
  return Math.max(program.duration_weeks || 0, maxWeek, program.weeks.length);
}

/** First and last day of a program week, or null when the program has no dates. */
export function weekRange(program, weekNumber) {
  const start = parseDate(program.start_date);
  if (start) {
    const s = addDays(start, (weekNumber - 1) * 7);
    return { start: s, end: addDays(s, 6) };
  }
  const wk = program.weeks.find((w) => w.week === weekNumber);
  const dates = (wk ? wk.days : []).map((d) => parseDate(d.scheduled_date)).filter(Boolean).sort((a, b) => a - b);
  return dates.length ? { start: dates[0], end: addDays(dates[0], 6) } : null;
}

// "26 Oct – 1 Nov"
export function weekRangeLabel(program, weekNumber) {
  const r = weekRange(program, weekNumber);
  return r ? `${dayMonth(r.start)} – ${dayMonth(r.end)}` : '';
}

/** The program week containing `today`, or null if today is outside the program. */
export function weekForDate(program, today) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (const w of program.weeks) {
    const r = weekRange(program, w.week);
    if (r && t >= r.start && t <= r.end) return w.week;
  }
  return null;
}

/**
 * "Day 2 - Hinge + Vertical Press + Pull (Wed)" -> { title: "Hinge, Vertical Press, Pull", dayLabel: "Day 2" }
 */
export function sessionTitle(dayName, index) {
  let t = (dayName || '').trim();
  const m = t.match(/^Day\s*(\d+)\s*[-–—:.]?\s*/i);
  const dayLabel = `Day ${m ? m[1] : index + 1}`;
  if (m) t = t.slice(m[0].length);
  t = t.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\+\s*/g, ', ').trim();
  return { title: t || dayLabel, dayLabel };
}

// "WED 28 OCT" (CSS uppercases); null when the day has no date
export function dateLabel(isoDate) {
  const d = parseDate(isoDate);
  return d ? `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` : null;
}

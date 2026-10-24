import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateProgram, csvToProgram, parseProgramText } from '../js/program.js';

const base = () => ({
  schema_version: 1,
  program_name: 'Test block',
  weeks: [{
    week: 2,
    days: [{
      day_name: 'Day 1',
      exercises: [
        { order: 1, exercise_id: 'back-squat', name: 'Back squat', sets: 4, reps: '3-5' },
        { order: 2, exercise_id: 'bench-press', name: 'Bench press', sets: 4, reps: '5' },
        { order: 3, exercise_id: 'pull-up', name: 'Pull-up', sets: 3, reps: '6', type: 'bodyweight', load_basis: 'added' },
      ],
    }],
  }],
});

test('a minimal valid program passes and gets defaults filled in', () => {
  const r = validateProgram(base());
  assert.equal(r.ok, true);
  const ex = r.program.weeks[0].days[0].exercises[0];
  assert.equal(ex.type, 'strength');
  assert.equal(ex.load_basis, 'total');
  assert.equal(ex.per_side, false);
  assert.deepEqual(ex.alternatives, []);
  assert.equal(r.program.units, 'kg');
});

test('error message says exactly where the problem is', () => {
  const p = base();
  p.weeks[0].days[0].exercises[2].sets = 'three';
  const r = validateProgram(p);
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ['Week 2, Day 1, exercise 3 ("Pull-up"): "sets" must be a number (a whole number from 1 to 20), or null.']);
});

test('reps must be a string', () => {
  const p = base();
  p.weeks[0].days[0].exercises[0].reps = 5;
  const r = validateProgram(p);
  assert.match(r.errors[0], /Week 2, Day 1, exercise 1 \("Back squat"\): "reps" must be text in quotes/);
});

test('missing required fields and bad enums are all reported', () => {
  const p = base();
  delete p.program_name;
  p.weeks[0].days[0].exercises[0].load_basis = 'each';
  p.weeks[0].days[0].exercises[1].exercise_id = 'Bench Press';
  const r = validateProgram(p);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 3);
  assert.ok(r.errors.some((e) => e.includes('"program_name" is required')));
  assert.ok(r.errors.some((e) => e.includes('"load_basis" must be one of')));
  assert.ok(r.errors.some((e) => e.includes('must be lowercase-kebab')));
});

test('unknown fields (typos) are rejected', () => {
  const p = base();
  p.weeks[0].days[0].exercises[0].cue = 'brace';
  assert.match(validateProgram(p).errors[0], /unknown field "cue"/);
});

test('duplicate exercise_id within a day, duplicate week and bad dates are rejected', () => {
  const p = base();
  p.weeks[0].days[0].exercises[1].exercise_id = 'back-squat';
  p.weeks[0].days[0].scheduled_date = '2026-02-30';
  p.weeks.push(structuredClone(base().weeks[0]));
  const r = validateProgram(p);
  assert.ok(r.errors.some((e) => e.includes('appears twice in this day')));
  assert.ok(r.errors.some((e) => e.includes('scheduled_date')));
  assert.ok(r.errors.some((e) => e.includes('Week 2: this week number appears more than once')));
});

test('not an object / no weeks', () => {
  assert.equal(validateProgram([]).ok, false);
  assert.match(validateProgram({ schema_version: 1, program_name: 'x' }).errors[0], /"weeks" is required/);
});

test('JSON pasted inside ``` fences from an AI chat is accepted', () => {
  const r = parseProgramText('```json\n' + JSON.stringify(base()) + '\n```');
  assert.equal(r.ok, true);
});

test('invalid JSON gives a readable error', () => {
  const r = parseProgramText('{ "schema_version": 1, }');
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /^This isn't valid JSON/);
});

const CSV = `week,day_name,scheduled_date,order,group,exercise_id,name,alternatives,type,sets,sets_note,reps,rpe,per_side,load_basis,prescription_note,cues,progression,notes
1,Day 1 - Lower,2026-09-14,1,,back-squat,Back squat,Safety-bar squat|Box squat,strength,4,,3-5,8-9,false,total,,"Brace, knees out",Add load when all sets hit 5,
1,Day 1 - Lower,,2,LOWER BACK,back-extension,Back extension,,bodyweight,2,,12-15,,no,added,,,,"Roman chair, by the mirrors"
1,Day 2 - Upper,2026-09-16,1,,db-row,One-arm DB row,,strength,3,,8-10,7,yes,per_hand,,,,
2,Day 1 - Lower,2026-09-21,1,,back-squat,Back squat,,strength,4,,3-5,8-9,,total,,,,
`;

test('CSV converts to the same structure as JSON', () => {
  const r = csvToProgram(CSV, 'My block');
  assert.equal(r.ok, true, r.errors.join('\n'));
  const p = r.program;
  assert.equal(p.program_name, 'My block');
  assert.equal(p.weeks.length, 2);
  assert.equal(p.weeks[0].days.length, 2);
  const sq = p.weeks[0].days[0].exercises[0];
  assert.deepEqual(sq.alternatives, ['Safety-bar squat', 'Box squat']);
  assert.equal(sq.cues, 'Brace, knees out');
  assert.equal(sq.sets, 4);
  assert.equal(sq.rpe, '8-9');
  assert.equal(p.weeks[0].days[0].scheduled_date, '2026-09-14');
  const be = p.weeks[0].days[0].exercises[1];
  assert.equal(be.group, 'LOWER BACK');
  assert.equal(be.per_side, false);
  assert.equal(be.notes, 'Roman chair, by the mirrors');
  assert.equal(p.weeks[0].days[1].exercises[0].per_side, true);
  assert.equal(p.weeks[0].days[1].exercises[0].load_basis, 'per_hand');
});

test('CSV errors name the row', () => {
  const bad = CSV.replace('db-row,One-arm DB row,,strength,3', 'db-row,One-arm DB row,,strength,three');
  const r = csvToProgram(bad);
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ['Row 4: "sets" must be a number (got "three").']);
});

test('CSV with a missing required column is rejected', () => {
  const r = csvToProgram('week,day_name,order,name\n1,Day 1,1,Squat\n');
  assert.match(r.errors[0], /required column "exercise_id" is missing/);
});

test('shipped sample program and JSON template are valid', () => {
  for (const f of ['data/sample-program.json', 'templates/program-template.json']) {
    const r = validateProgram(JSON.parse(readFileSync(new URL('../' + f, import.meta.url), 'utf8')));
    assert.equal(r.ok, true, `${f}: ${r.errors.join('\n')}`);
  }
});

test('shipped CSV template is valid', () => {
  const r = csvToProgram(readFileSync(new URL('../templates/program-template.csv', import.meta.url), 'utf8'), 'Template');
  assert.equal(r.ok, true, r.errors.join('\n'));
});

test('assist load basis, "max"/"near max" reps and null sets/reps/rpe are accepted', () => {
  const p = base();
  Object.assign(p.weeks[0].days[0].exercises[2], { load_basis: 'assist', reps: 'max', sets: null, rpe: null });
  p.weeks[0].days[0].exercises[1].reps = null;
  p.weeks[0].days[0].exercises[0].reps = 'near max';
  const r = validateProgram(p);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.equal(r.program.weeks[0].days[0].exercises[2].load_basis, 'assist');
  assert.equal(r.program.weeks[0].days[0].exercises[2].sets, null);
});

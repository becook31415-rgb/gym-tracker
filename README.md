# Gym Tracker

A simple, offline gym log for iPhone, installed to the Home Screen as a Progressive Web App (PWA).
Plain HTML, CSS and JavaScript modules with no framework, no build step and no runtime dependencies. All your data stays on the phone, in IndexedDB.
The hosted site contains only the app and made-up sample data.

- Log strength sets (weight, reps, RPE, set note) and cardio. Every keystroke autosaves.
- See your program's prescription, cues, progression rules and pinned reminders.
- Import a new program from JSON (or CSV). Export your log to files you save in OneDrive.
- Works fully offline after the first visit.

---

## Contents

1. [Run it on your Mac](#run-it-on-your-mac)
2. [Deploy: GitHub Pages (recommended)](#deploy-github-pages-recommended)
3. [Deploy: Netlify (alternative)](#deploy-netlify-alternative)
4. [Install on the iPhone](#install-on-the-iphone) (full guide: [IPHONE_SETUP.md](IPHONE_SETUP.md))
5. [Program file format](#program-file-format)
6. [Instruction for the AI that writes your next program](#instruction-for-the-ai-that-writes-your-next-program)
7. [Export files and the analytics app](#export-files-and-the-analytics-app)
8. [How weights are recorded](#how-weights-are-recorded)
9. [Personal bests](#personal-bests)
10. [Assumptions](#assumptions)
11. [Known limitations](#known-limitations)
12. [Project layout](#project-layout)

---

## Run it on your Mac

Node.js is only needed for the tests and the local preview. It is installed in `~/.local/node`, and `~/.zprofile` adds it to your PATH for new Terminal windows.

```bash
npm test
```

```bash
npm run serve
```

Then open <http://localhost:8080/>. Service workers work on `localhost` without HTTPS.

Full offline and update check in headless Chrome (uses a throwaway profile):

```bash
node tools/browser-check.mjs
```

---

## Deploy: GitHub Pages (recommended)

**Why GitHub Pages:** the repository *is* the deployment. After a one-time setup, every `git push` runs the tests and publishes automatically, with one fewer account and dashboard than Netlify.

The app will live at **https://becook31415-rgb.github.io/gym-tracker/**

### One-time setup

1. Install the GitHub CLI into your home folder. No password is needed. Claude Code can do this step for you.
2. Sign in once:
   ```bash
   gh auth login --hostname github.com --git-protocol https --web
   ```
   It prints a one-time code and opens github.com in your browser. Paste the code there and approve.
3. Create the public repository and push, from this folder:
   ```bash
   gh repo create gym-tracker --public --source . --remote origin --push
   ```
4. Tell Pages to publish from GitHub Actions:
   ```bash
   gh api -X POST repos/becook31415-rgb/gym-tracker/pages -f build_type=workflow
   ```
5. Start the first deploy, or simply push again:
   ```bash
   gh workflow run deploy.yml
   ```
6. Watch it finish (about one minute):
   ```bash
   gh run watch
   ```

### Every update after that

```bash
git add -A
```

```bash
git commit -m "Describe the change"
```

```bash
git push
```

The workflow ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) runs `npm test`, and stops if any test fails. It then copies only the app files into the site, stamps `sw.js` with the commit id and publishes. Next time you open the app on the phone, an **"Update available - tap to reload"** banner appears. Your logged data is never touched by an update.

There is no version number to bump by hand. The commit id does that job.

---

## Deploy: Netlify (alternative)

1. Sign up at netlify.com with your GitHub account.
2. **Add new site → Import an existing project → GitHub → gym-tracker**.
3. Build command: *(leave empty)*. Publish directory: `.`
4. Deploy. Every push to `main` redeploys.

Netlify does not run the version-stamping step, so with Netlify you must change `const VERSION = 'dev'` in `sw.js` (e.g. to `'2'`, `'3'`…) on each release, or phones will not see the update.

---

## Install on the iPhone

1. Open the app URL in **Safari** (it must be Safari for Add to Home Screen to give a standalone app).
2. Tap the **Share** button (square with an up-arrow), scroll down, tap **Add to Home Screen**, then **Add**.
3. Open it from the new **Gym Log** icon. It opens full-screen without Safari's address bar.
4. From then on it works with no network.

To move your real program and history onto the phone, follow [IPHONE_SETUP.md](IPHONE_SETUP.md). The full test list is in [TESTING.md](TESTING.md).

**Data lives per device.** The app's storage belongs to the browser on that one device. Importing on your Mac does not put anything on your iPhone. Always import and restore on the iPhone itself.

---

## Program file format

The app accepts a `.json` file (preferred) or a `.csv` file, from the file picker or pasted into the text box. Validation is strict and all-or-nothing. If anything is wrong, nothing is imported and you get messages like:

> Week 2, Day 1, exercise 3 ("Chin-up"): "sets" must be a number (a whole number from 1 to 20), or null.

Importing a new program never deletes logged history. History is matched by `exercise_id`.

Templates: [templates/program-template.json](templates/program-template.json) and [templates/program-template.csv](templates/program-template.csv). Both are also downloadable from Settings.

### JSON schema (`schema_version` 1)

```jsonc
{
  "schema_version": 1,                        // required, must be 1
  "program_name": "Block 4 - Upper/Lower",    // required
  "start_date": "2026-09-14",                 // YYYY-MM-DD or null
  "duration_weeks": 8,
  "units": "kg",                              // "kg" | "lb"
  "program_notes": [ { "title": "How to progress", "body": "..." } ],
  "weeks": [                                  // required, non-empty
    {
      "week": 6,                              // required, whole number, unique
      "days": [                               // required, non-empty
        {
          "day_name": "Day 1 - Squat + Horizontal Press + Pull",   // required, unique within the week
          "scheduled_date": "2026-09-28",
          "exercises": [                      // required, non-empty
            {
              "order": 1,                     // required, unique within the day
              "exercise_id": "back-squat",    // required; lowercase-kebab; same id for the same movement every week
              "name": "Back squat",           // required
              "alternatives": ["Safety-bar squat"],
              "type": "strength",             // "strength" | "bodyweight" | "cardio"
              "group": null,                  // heading shown above, e.g. "LOWER BACK"
              "sets": 4,                      // whole number 1-20, or null
              "sets_note": null,              // e.g. "per progression table"
              "reps": "3-5",                  // a string or null: "5", "3-5", "12-15", "30s hold", "max", "near max"
              "target_weight": null,          // number or null (in "units")
              "rpe": "8-9",                   // string, number or null
              "per_side": false,              // reps are done on each side
              "load_basis": "total",          // "total" | "per_hand" | "per_side" | "added" | "assist"
              "prescription_note": null,
              "cues": "Brace, knees track over toes",
              "progression": "Add load once all sets hit 6 reps cleanly",
              "notes": "",                    // fixed note, e.g. equipment location
              "superset_group": null,
              "cardio": null                  // type "cardio": {"cardio_type":"bike","duration_min":20,"intensity":"RPE 5"}
            }
          ]
        }
      ]
    }
  ]
}
```

Rules the validator enforces beyond the types:
- Unknown field names are rejected, which catches typos like `"cue"` for `"cues"`.
- An `exercise_id` may appear only once per day, because each day's log is keyed by it.
- Dates must be real calendar dates.
- AI output pasted with its ```` ```json ```` fences is accepted, and the fences are stripped.

### CSV fallback

One row per exercise. Columns (header row required; order doesn't matter):

`week, day_name, scheduled_date, order, group, exercise_id, name, alternatives, type, sets, sets_note, reps, rpe, per_side, load_basis, prescription_note, cues, progression, notes`

Optional extra columns: `program_name`, `units`, `target_weight`, `superset_group`, `cardio_type`, `duration_min`, `intensity`.

- `alternatives` are separated by `|`.
- `per_side` accepts true/false/yes/no/1/0.
- Rows with the same `week` + `day_name` form one day.
- Without a `program_name` column, the file name is used.
- CSV can't carry `program_notes`. Use JSON for those.
- Errors name the row, e.g. `Row 4: "sets" must be a number (got "three").`

---

## Instruction for the AI that writes your next program

Paste this, and attach `templates/program-template.json` plus the schema section above:

> Produce my next 8-week program as one valid JSON file, in a single code block, with no commentary. Follow the attached schema exactly, with the same field names. Include every week and every day explicitly. Use the same exercise_id for the same movement in every week. Write reps as strings. Use null when a value does not apply. Put form cues in cues, progression rules in progression, and program-wide guidance in program_notes.

Tip: also list the `exercise_id`s from your current program and ask it to reuse them, so "last time" and PBs carry over between blocks.

---

## Export files and the analytics app

**Settings → Export / Save to Files** (also offered after **Finish workout**) creates three files and opens the iOS share sheet. Choose **Save to Files → OneDrive → your folder**. iOS web apps cannot write to a folder directly. On a desktop browser the files download instead. If you cancel the share sheet, nothing is marked as exported.

Settings shows "Last exported". The Home screen shows a reminder banner when real data has gone more than 7 days without an export.

The export code sits behind one interface (`exportFiles()` in [js/exporter.js](js/exporter.js)). A future "upload to OneDrive via Microsoft Graph" exporter can be added there.

Demo data is **never** exported.

### 1. `workout-log_YYYY-MM-DD_HHmm.json`: full log, also used as the backup

```jsonc
{
  "schema_version": 1,
  "app": "gym-tracker",
  "exported_at": "2026-10-24T08:15:00-04:00",
  "sessions": [ {
      "session_id": "uuid", "kind": "workout", "date": "2026-09-28",
      "start_time": "2026-09-28T18:02:11-04:00", "end_time": "2026-09-28T19:20:40-04:00",
      "program_name": "...", "week": 6, "day_name": "...", "unit": "kg", "session_notes": "...",
      "updated_at": "...",
      "exercises": [ {
          "exercise_id": "back-squat", "name_performed": "Back squat", "skipped": false,
          "exercise_note": null, "pinned_note": null, "load_basis": "total", "per_side": false, "type": "strength",
          "unit": "kg",       // optional: overrides the session unit (e.g. "lb" for a machine in pounds)
          "order": 1, "set_count": 4,
          "sets": [ { "set_number": 1, "weight": 100, "unit": "kg", "reps": 3, "rpe": null, "set_note": "belt", "completed": true } ],
          "cardio": null      // cardio exercises: {cardio_type, duration_min, intensity_rpe, completed}
      } ]
  } ],
  "cardio_sessions": [ { "session_id": "uuid", "kind": "cardio", "date": "2026-10-20", "start_time": "...",
      "cardio_type": "bike", "duration_min": 25, "intensity_rpe": 5, "notes": "...", "updated_at": "..." } ],
  "pinned_notes": [ { "id": "...", "exercise_id": "deadlift", "text": "Bring chalk", "source_session_id": "...", "created_at": "...", "updated_at": "..." } ]
}
```

Times are local, with the UTC offset. Each set carries its own `unit`, the unit it was typed in. The unit of a set is taken from the set's own `unit`, else the exercise's `unit`, else the session's `unit`. Weights and reps may be `null` (not recorded). A ticked set with both null means "done, no numbers". Only `session_id`, `date`, `exercises[].exercise_id` and each set's `set_number` and `completed` are required.

### 2. `workout-sets_YYYY-MM-DD_HHmm.csv`: one row per confirmed (ticked) set

`session_id, date, week, day_name, exercise_id, name_performed, set_number, weight, unit, load_basis, per_side, reps, rpe, set_note, session_notes, program_name`

Skipped exercises and unticked sets are not in the CSV. They are in the JSON log, with `skipped: true` / `completed: false`.

### 3. `workout-cardio_YYYY-MM-DD_HHmm.csv`: one row per cardio session

`session_id, date, start_time, cardio_type, duration_min, intensity_rpe, notes, source, exercise_id`

`source` is `standalone` for a cardio session, or `workout` for a cardio exercise done inside a program day. A `workout` row reuses the workout's `session_id` and adds its `exercise_id`.

### Merging repeated exports (pandas)

Every export contains *all* sessions, and each session keeps its `session_id` forever. You can therefore drop each new export into the same OneDrive folder and merge them all without duplicates. For each session, keep the rows from the **newest** file that contains it, so edits and removed sets are handled correctly. Note that `set_number` restarts for each exercise, so a set's unique key is `session_id + exercise_id + set_number`.

```python
import glob, os
import pandas as pd

FOLDER = os.path.expanduser("~/Library/CloudStorage/OneDrive-Personal/Gym exports")  # change to your folder

def load_latest(pattern):
    frames = []
    for path in sorted(glob.glob(os.path.join(FOLDER, pattern))):   # file names sort by export time
        df = pd.read_csv(path, dtype={"session_id": str, "exercise_id": str})
        df["_file"] = os.path.basename(path)
        frames.append(df)
    if not frames:
        return pd.DataFrame()
    df = pd.concat(frames, ignore_index=True)
    newest = df.groupby("session_id")["_file"].transform("max")      # newest export containing each session
    return df[df["_file"] == newest].drop(columns="_file")

sets = load_latest("workout-sets_*.csv")
sets = sets.drop_duplicates(subset=["session_id", "exercise_id", "set_number"], keep="last")

cardio = load_latest("workout-cardio_*.csv")
cardio["exercise_id"] = cardio["exercise_id"].fillna("")
cardio = cardio.drop_duplicates(subset=["session_id", "exercise_id"], keep="last")

print(sets.groupby("exercise_id")["weight"].max())
```

### Restore from backup

**Settings → Restore from backup** reads a `workout-log_….json` (or a hand-made file in the same shape) and merges it by `session_id`, and pins by `id`. A session that already exists is replaced only if the backup copy is newer (`updated_at`). Restoring the same file twice changes nothing.

The restore checks every session, exercise and set first. If anything is wrong, nothing is restored, and you get a list of each problem with its location, e.g. `Session 3 (2026-09-16, week 1, Day 2…), exercise 2 ("Lat pulldown"), set 1: "weight" must be a number or null`. Missing `app`, `kind` or `updated_at` fields are allowed and listed as warnings. A missing `kind` is the only thing filled in. After a restore, Home jumps to the next week you haven't logged.

---

## How weights are recorded

The number you type is stored exactly as typed, with its `unit`. Each exercise's `load_basis` says what the number means, and the app shows it as a label. It never multiplies or converts by load basis.

| load_basis | Meaning | Label | Example from notes |
|---|---|---|---|
| `total` | barbell, single stack | `kg` | "100kg x 3" |
| `per_hand` | one dumbbell in each hand | `kg per hand` | "20s x" = 20 kg in each hand |
| `per_side` | load on each side of a machine | `kg per side` | "60kgs each side x 6" |
| `added` | added to bodyweight | `kg added` | "BW + 5kg x 4" → 5 |
| `assist` | assistance from a machine (lower is better) | `lb assist` | assist machine at 60 lb → 60 |

`per_side: true` means the **reps** are per side (single-arm/leg, alternating), e.g. "50kg x 8s".

- **Bodyweight exercises:** leave weight blank (or 0) for bodyweight only. A number means added weight. Band assistance goes in the set note (tap the set number).
- **kg/lb:** each exercise is logged in its own unit, because some machines are in lb. A new exercise starts in the unit you last used for it; with no history it uses the Settings unit. Change it in that exercise's **Notes & cues → Setup**. Stored weights are never converted or rewritten.

### "Last time", pre-fill and PBs match like with like

History is matched by **variant**: `exercise_id` + `name_performed` + `load_basis` + `unit`. A safety-bar squat never compares with a back squat. A lat pulldown logged per side in kg never compares with one logged as a total in lb.

- **A new session uses what you did last time.** When you open a day, each exercise defaults to the name, load basis and unit you used the last time you did that `exercise_id`. For example, it opens as "Walking lunge" if that's what you did, even though the program says "Front-foot-elevated split squat". Change it with the **Doing:** selector. Choosing an alternative also switches to the setup you last used for that alternative. The selector lists the program's names plus every name you have logged for that exercise.
- **Pre-fill order:** first the same set number last time. If the program now asks for more sets than you did, the extra sets copy the last set you did. Otherwise the program's `target_weight` and the top of the rep range are used. Reps like `"max"` don't pre-fill a number unless you have history.

---

## Personal bests

[js/pb.js](js/pb.js), tested in [tests/pb.test.mjs](tests/pb.test.mjs). For each exercise variant (see above), a ticked set is a PB when either:
- its weight is higher than any earlier set with ≥ 1 rep, or
- its weight equals the previous best weight and it has more reps than ever done at that weight.

For bodyweight-only sets (blank/0 weight), the PB is the highest reps in one set. For `assist` exercises, **less** assistance is the PB, and the same assistance with more reps is too. Sets with blank reps, or blank weight on weighted exercises, are ignored. The PB shows as a yellow **PB** on the set's tick and next to the exercise name.

---

## Assumptions

Decisions I made where the brief or the notes were ambiguous:

**Sample data**
1. Because the repo is public, `data/sample-program.json` and `data/sample-history.json` contain **made-up numbers and notes**. They follow the structure and recording quirks of your real notes, but none of your real numbers or personal comments are included.
2. Week 7 (a copy of Week 6) was added to the sample program, so that after loading demo data there is an unlogged week to test with.
3. "Booty Builder machine" became `hip-thrust-machine` / "Hip thrust machine" (Booty Builder is a brand name).

**Transcription rules (applied to the made-up data)**

4. "Weighted/assisted pull-up", "Pull-ups" and "Pull-up" all use `pull-up`, with `type: bodyweight` and `load_basis: added`. "Negative pull-up" is its own id (`negative-pull-up`).
5. "A or B" exercises become `name: A`, `alternatives: [B]`. The demo log records what was actually done in `name_performed` (e.g. "Conventional deadlift").
6. A trailing accessory-block prescription (e.g. "2 x 12-15, RPE 8-9") applies to the accessories above it with no prescription of their own. Week 4 Day 1 had none, so the calf raise's "2 x 12-15 @ RPE 7" was used. Day 3 had none, so hanging leg raise (2 x 10-12) and rotator cuff (2 x 12-15) are my guesses.
7. **Face pull** logged like "50kg x 12s": face pulls are two-handed, so the "s" was treated as a slip. That gives 12 reps, `per_side: false`, `load_basis: total`. *Please confirm.*
8. **Lat pulldown** logged like "60kgs each side": `load_basis: per_side` (plate-loaded machine).
9. **Walking lunges / incline DB press / chest-supported row** (logged like "20s", "28kgs each hand", "20kgs x 8" on the incline bench): `load_basis: per_hand`. Lunges also get `per_side: true`.
10. **Calf raise** "BW x 12s": single-leg, so `per_side: true`, bodyweight.
11. **Glute medius raises** "1 x 15": one set of 15, `per_side: true` (side-lying raises are one leg at a time).
12. **Pallof press** "2 x 10/side" and **rotator cuff** "8kg x 12s": `per_side: true`, reps "10" / 12.
13. **Hip-thrust hold** "5s hold each leg alt x 5": 1 set, reps `"5 x 5s hold"`, `per_side: true`. "DID" with no numbers = one ticked set with blank weight and reps.
14. "BW + 5kg dbl x 4" means weight 5 (added) with set note "dbl". "w belt", "narrower grip", "no straps", "purple band" and "4 sec eccentric" are set notes. "127.5 x" means reps blank.
15. Equipment locations (e.g. "cable station by the door") go in `notes`. Bracketed technique text goes in `cues`. Medical-sounding progression text was replaced with a neutral version in the public sample.

**App behaviour**

16. "Skipped exercises need to be saved for next week" is implemented as follows. A skip is stored as `skipped: true` with no sets. Next time the exercise shows **"Skipped last time (date)"**, and pre-fill comes from the last time you actually did it.
17. Pre-fill uses the same set number from the last time you did that variant. Extra sets the program now asks for copy your last set, and otherwise the program's `target_weight` and top of rep range are used. This replaces the original rule, so that every set of a new week is pre-filled from the previous one. Pre-filled values look grey until you edit or tick them, and they are not saved until you do.
18. The very first logged set of an exercise is never a PB, since there is nothing to beat. Earlier sets in the same session count towards the bar for later sets.
19. Only ticked sets go into the CSV export. Values you typed without ticking are kept in the JSON with `completed: false`.
20. A pinned note is linked to the session note you pinned it from. Unticking "Pin" removes it. Pinned reminders from earlier sessions can be edited or removed inside "Notes & cues".
21. Cardio "intensity" is stored as a number from 1 to 10 (`intensity_rpe`).
22. The program validator rejects unknown fields and a duplicate `exercise_id` within a day. This catches AI typos early, at the cost of being picky.
23. Program `target_weight` is in the program's `units`. It is converted only for pre-fill if you display the other unit.
24. An imported session with no `start_time` and no `end_time` counts as **completed** on Home, because it was logged elsewhere. Restored weeks therefore show ✓, not "in progress".
25. Any logged exercise that isn't in that program day still gets its own card, under "NOT IN THIS PROGRAM DAY", so nothing logged is ever hidden.
26. The Settings unit is now the *default* for exercises with no history, since each exercise keeps its own unit.

---

## Privacy

The repo is public, so **your real data must never be committed.** [.gitignore](.gitignore) ignores *every* `.json` and `.csv` file, except the five known code or made-up files: `package.json`, `data/sample-*.json` and `templates/program-template.*`. It also ignores the folders `import-data/`, `private/`, `exports/` and `backups/`. Keep your real program and history files out of this folder (e.g. in Downloads or OneDrive). Check `git status` before committing if unsure.

`data/sample-program.json` and `data/sample-history.json` contain only made-up numbers and notes. **Load demo data** uses them.

## Known limitations

- **Storage eviction:** iOS can clear data for websites not used for weeks, but Home Screen apps are much better protected. Settings shows whether `navigator.storage.persisted()` is true. Regular exports are your real backup, so watch the 7-day reminder.
- **Share sheet:** iOS needs the export to start straight from your tap, so the files are built from data already in memory. If iOS ever shows nothing, try again. On a desktop browser the files download instead.
- **The Claude desktop app's built-in browser** cannot register service workers, so offline behaviour was verified in headless Chrome (`tools/browser-check.mjs`) instead. Real-iPhone checks are in [TESTING.md](TESTING.md).
- **Repo inside OneDrive:** this folder sits in OneDrive, which syncs `.git` too. That normally works. If OneDrive ever reports conflicts in `.git`, move the project folder out of OneDrive (e.g. to `~/Developer/gym-tracker`). GitHub is the real backup of the code.

---

## Project layout

```
index.html               app shell + iOS meta tags
manifest.webmanifest     name, icons, standalone display
sw.js                    service worker: precache, cache-first, update banner
css/app.css              20px base, light/dark, 44px+ targets
js/app.js                screens, routing, autosave            (browser)
js/db.js                 IndexedDB wrapper                      (browser)
js/exporter.js           share sheet / download exporter        (browser)
js/display.js            Home titles, date labels, week ranges  (pure, tested)
js/units.js              kg/lb, load-basis labels               (pure, tested)
js/pb.js                 personal-best rules                    (pure, tested)
js/history.js            last time, pre-fill, prior sets        (pure, tested)
js/program.js            validation, CSV → JSON                 (pure, tested)
js/csv.js                CSV read/write                         (pure, tested)
js/export.js             export rows/files, backup merge        (pure, tested)
data/                    made-up sample program + demo history
templates/               program templates (JSON, CSV)
icons/                   generated by tools/make-icons.mjs
tests/                   node --test unit tests
tools/                   serve.mjs, make-icons.mjs, browser-check.mjs
.github/workflows/       GitHub Pages deploy
```

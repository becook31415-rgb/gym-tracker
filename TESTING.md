# iPhone 11 test checklist

Tick each line as you go. If something fails, note the step number and what you saw.

## A. Install

1. [ ] On the Mac, deploy (README → "Deploy: GitHub Pages") and wait for the workflow to go green.
2. [ ] On the iPhone, open **Safari** and go to `https://becook31415-rgb.github.io/gym-tracker/`.
3. [ ] The Home screen shows **Sample Block - Upper/Lower** with a Week selector.
4. [ ] Tap **Share → Add to Home Screen → Add**. A blue barbell icon named **Gym Log** appears.
5. [ ] Close Safari. Open the app from the **Gym Log** icon. There is no Safari address bar, and the text does not sit under the clock or notch.

## B. Program and demo data

6. [ ] **Settings / Export → Import program → Choose file**. Pick `sample-program.json` (download it from the repo to Files first), or paste its contents. You should see "Imported … 3 weeks, 7 days".
7. [ ] Paste `{ "schema_version": 1 }` and tap **Import pasted text**. A clear error list appears, and the current program is unchanged.
8. [ ] **Load demo data**. A toast says "Demo data loaded (6 sessions)".
9. [ ] Home → Week 6: all three days show a green ✓.
10. [ ] **Program notes**: four collapsible sections open and close.

## C. Log a full session

11. [ ] Home → **Week 7 → Day 1**.
12. [ ] Back squat shows "4 x 3-5 @ RPE 8-9" and "Last: 100kg x 3, 100kg x 5, 107.5kg x 3, 100kg x 5". The rows are pre-filled in grey.
13. [ ] Tap the ✓ on set 1. The row turns green and the date/start time appears at the top.
14. [ ] Tap the weight on set 2. The whole number is selected. Type `110` and tick it. A yellow **PB** appears on the tick and next to "Back squat".
15. [ ] The number keypads appear: decimal for weight (a `.` key is available, e.g. `102.5`), and numbers for reps.
16. [ ] Tap the set number "3". A set-note field appears. Type `belt`. The "3" turns blue. **Remove set** deletes the row. **+ Add set** adds one back.
17. [ ] Bench press: use the **Doing:** selector to pick "DB floor press".
18. [ ] Pull-up: the weight shows a grey "BW". Leave it blank, set reps to 4 and tick. Then type `5` in another row's weight: that set is "+5 kg".
19. [ ] Hip thrust machine: tap **Skip**. The card shows "Skipped".
20. [ ] Open **Notes & cues** on Back squat. Type `Bring chalk` and tick **Pin to this exercise**.
21. [ ] Type a session note at the bottom, then tap **Finish workout**. "Workout saved. Export your data now?" appears. Tap **Not now**.
22. [ ] Home → Week 7: Day 1 has a ✓. Open it again: everything is still there, and you can edit it.
23. [ ] Open Week 6 **Day 1**: 📌 "Bring chalk" now shows under Back squat, because pins show in every other session of that exercise. Open Week 7 **Day 2**: deadlift shows 📌 "Bring long socks for deadlifts" from the demo data.
24. [ ] **Cardio session**: pick *row*, type 20 minutes and RPE 6, then **Save cardio**. It appears under "Recent cardio".

## D. Offline and persistence

25. [ ] Turn on **Airplane Mode**.
26. [ ] Swipe the app away in the app switcher (force-quit). Open it from the icon again: it loads, and a small **Offline** tag shows at the top.
27. [ ] Log a set while offline. Force-quit and re-open. The set is still there.
28. [ ] Turn Airplane Mode off.

## E. Export, restore, storage

29. [ ] **Settings → Export / Save to Files**. The share sheet shows 3 files. Choose **Save to Files → OneDrive → your folder → Save**.
30. [ ] "Last exported" shows today's date and time.
31. [ ] In the Files app, open OneDrive: `workout-log_…json`, `workout-sets_…csv` and `workout-cardio_…csv` are there.
32. [ ] **Restore from backup**: pick that `workout-log_…json`. You should see "0 added, 0 updated, N already here" (no duplicates).
33. [ ] **Clear demo data**. Week 6's ✓ marks disappear, and your Week 7 session is still there.
34. [ ] Settings → Storage: note what "Persistent storage granted" says (yes/no).

## F. Readability and updates

35. [ ] Switch the iPhone to Dark Mode (Control Centre → long-press brightness). The app follows it and stays easy to read.
36. [ ] Settings → Units → **lb**. Old kg sets show converted (100 kg → 220.5). Switch back to **kg**.
37. [ ] After the next deploy, open the app. **"Update available - tap to reload"** appears. Tap it: the app reloads and your data is unchanged.

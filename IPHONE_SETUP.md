# Setting up your iPhone with your real program and history

About 15 minutes. You need your iPhone 11, your Mac, and the two files:
your **program** JSON file and your **history** (workout-log) JSON file.

> **Storage is per device, and per app.** The app keeps your data inside the browser storage of the device it runs on.
> - Importing on your **Mac** does **not** put anything on your iPhone.
> - On the iPhone, the **Home Screen app** has its own storage, separate from Safari tabs. Import and restore **inside the Gym Log app opened from its Home Screen icon**, not in a Safari tab.
>
> Your files never go to GitHub or the website. They only travel from your Mac to your phone.

---

## 1. Deploy the latest version (Mac)

Claude Code does this for you with a commit and `git push`. GitHub then publishes the new version in about a minute.
Check it is live: open `https://becook31415-rgb.github.io/gym-tracker/` on the Mac, go to **Settings**, and scroll to the bottom. **App version 1.0.0 (build xxxxxxx)** should show the newest commit id.

## 2. Install (or update) the app on the iPhone

**If Gym Log is not on your Home Screen yet:**
1. Open **Safari** (not Chrome) and go to `becook31415-rgb.github.io/gym-tracker`.
2. Tap **Share** (the square with an up-arrow) → scroll down → **Add to Home Screen** → **Add**.
3. Close Safari. From now on, always open **Gym Log** from its Home Screen icon.

**If it is already installed:** open **Gym Log** from the icon. Within a few seconds you should see **"Update available - tap to reload"**. Tap it. If no banner appears, swipe the app away and open it again. Settings → bottom should show the new build id.

## 3. Move the two files to the iPhone

Pick **one** of these.

**A. AirDrop (simplest)**
1. iPhone: unlock it. In **Control Centre**, long-press the network box → **AirDrop** → **Contacts Only** or **Everyone for 10 Minutes**.
2. Mac: open **Finder** where the files are. Select both files (click one, ⌘-click the other), right-click → **Share** → **AirDrop** → choose your iPhone.
3. iPhone: accept if asked. The files land in the **Files** app → **Downloads**. If iOS asks which app to open them with, choose **Save to Files** → **Downloads**.

**B. OneDrive or iCloud Drive**
1. Mac: copy both files into a private OneDrive or iCloud Drive folder, e.g. `OneDrive/Gym/import`.
   ⚠️ **Not** into the `Workout Tracker` project folder. That folder is published to GitHub. (Its `.gitignore` blocks these files anyway, but keep them out.)
2. iPhone: open the **Files** app → **Browse** → **OneDrive** (or **iCloud Drive**) → `Gym/import`. Tap each file once so it downloads (the cloud icon disappears). If OneDrive isn't listed under Browse, tap **⋯ → Edit** and switch OneDrive on. The OneDrive app must be installed and signed in.

## 4. Import your program (iPhone, inside Gym Log)

1. Open **Gym Log** from the Home Screen icon.
2. Tap **Settings / Export** → under **Import program** tap **Choose .json or .csv file**.
3. Tap **Browse** if needed → **Downloads** (or your OneDrive folder) → your program file.
4. Confirm **Replace "Sample Block - Upper/Lower" with "<your program>" (N weeks, N days)?** → **OK**.
5. You should see: **Imported "<your program>": N weeks, N days. Home now opens on Week 1.**
   (It says Week 1 because the history isn't loaded yet. The next step fixes that.)

If you see a red **Not imported** box instead, take a screenshot and send it to Claude Code.

## 5. Restore your history (iPhone, same screen)

1. Under **Restore from backup** tap **Choose backup file** → your history file.
2. You should see **Restored: N added, 0 updated, 0 already here (file had N workouts, 0 cardio, N sets). Home now opens on Week N**, where Week N is the week after the last one you logged.
   A hand-made history file may also show small grey notes such as *No "app" field…*, *had no "kind"…* or *have no "updated_at"…*. These are normal, and nothing is lost.
3. Restoring the same file again is safe: it says "0 added … N already here".

Do **not** tap **Load demo data** on this phone. It wouldn't touch your data, but you don't need it.

## 6. Check it looks right

1. Tap **‹ Home**. The Week selector shows the **next unlogged week**, and its **Day 1** has a blue outline.
2. Change the Week selector to earlier weeks: every logged day shows a green **✓**. Switch back.
3. Open **Day 1** of the next week. Every exercise you have done before shows a **Last:** line from the last time you did it, and the rows are pre-filled in grey with those numbers.
   - An exercise you have never logged has no numbers.
   - If the program asks for more sets than you did last time, the extra rows copy your last set.
4. Each exercise opens with the **name, load type and unit you used last time**. A machine you logged per side in kg shows **kg per side**, and an assist machine in lb shows **lb assist**. To switch machine, open **Notes & cues → Setup for this exercise** and set **Unit** and **Weight is**.
5. Where the program offers alternatives, the **Doing:** selector starts on the variation you last did, and lets you switch.
6. **Settings → Storage**: note whether **Persistent storage granted** says **yes** or **no**.

Opening a day does not create anything. A session is only saved once you type in a field or tick a set.

## 7. Offline test

This uses a throwaway cardio entry, so your next workout stays untouched.

1. Turn on **Airplane Mode** (Control Centre).
2. Swipe up from the bottom and pause, then swipe **Gym Log** away to force-quit it.
3. Open **Gym Log** from the icon. It loads, and a small yellow **Offline** tag shows at the top right.
4. Open your next workout day: the program and pre-filled numbers are all there.
5. **‹ Home → Cardio session**: Type **walk**, Duration **1**, Notes **offline test** → **Save cardio**.
6. Force-quit the app again and re-open it from the icon (still in Airplane Mode).
7. **Cardio session**: **offline test** is listed under **Recent cardio**. Tap it → **Delete this cardio session** → **OK**.
8. Turn **Airplane Mode** off.

## 8. First backup (recommended)

1. **Settings → Export / Save to Files**. The share sheet shows 3 files.
2. Choose **Save to Files** → **OneDrive** → your gym exports folder → **Save**.
3. **Last exported** now shows today's date. This copy now contains everything that is on the phone.

If you used AirDrop, you can delete the two imported files from **Files → Downloads** afterwards. The app has its own copy.

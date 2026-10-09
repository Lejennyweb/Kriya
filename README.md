# Kriya

From 20.09.2026 through 20.03.2027. Two kriyas a day until 29.10.2026, then one a day.

Before a session: 4 hours after a meal, 2.5 hours after a snack, 1.5 hours after tea, coffee, or juice, 4 hours after you finish the previous kriya. Water does not count.

Open the site in the phone browser, then install it. The record stays in that browser. The countdown is the clock, so it is right when you come back, online or not.

Cloudflare Pages: framework preset None, build command empty, output directory `/`. The repo root is the site.

After you log food or a kriya, the page says what you can still eat or drink and the clock time each one has to stop, so practice is not pushed later. Water never counts. Turn on reminders once. After that those same lines are sent at the times they name, including while the page is closed, in browsers that allow it.

## Your pieces

`data/steps.js` — the guided steps, `{ name, seconds }`.

`data/SH Sadhguru.mp3` — the sound that marks the next step. Until that file plays, the clock still runs.

A timer inside a running session can be saved. Every saved timing, kriya, and meal can be deleted.

(function () {
  // Half a year counted from 20 Sep 2026, through 20 Mar 2027.
  // The first 40 days are two kriyas a day. After that, one a day.
  const START = { y: 2026, m: 9, d: 20 };
  const END = { y: 2027, m: 3, d: 20 };
  const TWICE_DAYS = 40;

  const GAP_MS = {
    meal: 4 * 60 * 60 * 1000,
    snack: 2.5 * 60 * 60 * 1000,
    beverage: 1.5 * 60 * 60 * 1000,
    water: 0,
    kriya: 4 * 60 * 60 * 1000,
  };

  const CAN_PRACTICE = "You can practice.";

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function dayKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function programStart() {
    return new Date(START.y, START.m - 1, START.d);
  }

  function programEnd() {
    return new Date(END.y, END.m - 1, END.d);
  }

  function dayIndex(date) {
    const diff = startOfDay(date).getTime() - programStart().getTime();
    return Math.round(diff / 86400000);
  }

  function requiredOn(date) {
    const index = dayIndex(date);
    if (index < 0 || index > dayIndex(programEnd())) return 0;
    return index < TWICE_DAYS ? 2 : 1;
  }

  function programLengthDays() {
    return dayIndex(programEnd()) + 1;
  }

  function gapFor(kind) {
    return GAP_MS[kind] || 0;
  }

  function bindingWait(now, meals, kriyas) {
    let openAt = 0;
    let reason = null;

    const consider = (until, item) => {
      if (until > openAt) {
        openAt = until;
        reason = item;
      }
    };

    for (const meal of meals || []) {
      const gap = gapFor(meal.kind);
      if (!gap || !Number.isFinite(meal.finishedAt)) continue;
      consider(meal.finishedAt + gap, { type: "meal", meal });
    }

    for (const kriya of kriyas || []) {
      if (!Number.isFinite(kriya.at)) continue;
      consider(kriya.at + GAP_MS.kriya, { type: "kriya", kriya });
    }

    return { openAt, ready: now >= openAt, reason };
  }

  function activeWaits(now, meals, kriyas) {
    const rows = [];
    for (const meal of meals || []) {
      const gap = gapFor(meal.kind);
      if (!gap || !Number.isFinite(meal.finishedAt)) continue;
      const until = meal.finishedAt + gap;
      if (until > now) rows.push({ until, type: "meal", meal });
    }
    for (const kriya of kriyas || []) {
      if (!Number.isFinite(kriya.at)) continue;
      const until = kriya.at + GAP_MS.kriya;
      if (until > now) rows.push({ until, type: "kriya", kriya });
    }
    rows.sort((a, b) => b.until - a.until);
    return rows;
  }

  function formatWhen(ms, now) {
    const date = new Date(ms);
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    if (dayKey(date) === dayKey(new Date(now))) return time;
    return `${date.getDate()}.${pad(date.getMonth() + 1)} ${time}`;
  }

  function formatSpan(ms) {
    const min = Math.max(0, Math.round(ms / 60000));
    if (Math.abs(min - 90) <= 1) return "1.5 hours";
    if (Math.abs(min - 150) <= 1) return "2.5 hours";
    if (Math.abs(min - 240) <= 1) return "4 hours";
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h && m) return `${h} h ${m} min`;
    if (h) return h === 1 ? "1 hour" : `${h} hours`;
    return `${m} min`;
  }

  function formatClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return `${h}:${pad(m)}:${pad(s)}`;
    return `${m}:${pad(s)}`;
  }

  function reminderBody(kind, openAt, now) {
    const practice = formatWhen(openAt, now);
    const snackUntil = formatWhen(openAt - GAP_MS.snack, now);
    const drinkUntil = formatWhen(openAt - GAP_MS.beverage, now);
    if (kind === "meal") {
      return `No more meals if you want to practice at ${practice}. A snack until ${snackUntil}. Tea, coffee, or juice until ${drinkUntil}. Water any time.`;
    }
    if (kind === "snack") {
      return `No more snacks if you want to practice at ${practice}. Tea, coffee, or juice until ${drinkUntil}. Water any time.`;
    }
    return `Only water from now, if you want to practice at ${practice}.`;
  }

  function allowance(now, meals, kriyas) {
    const wait = bindingWait(now, meals, kriyas);
    if (wait.ready) return { ready: true, openAt: wait.openAt, nowText: "", messages: [] };

    const openAt = wait.openAt;
    const options = [
      { kind: "meal", name: "A meal", gap: GAP_MS.meal },
      { kind: "snack", name: "A snack", gap: GAP_MS.snack },
      { kind: "beverage", name: "Tea, coffee, or juice", gap: GAP_MS.beverage },
    ];
    const lines = [`Practice at ${formatWhen(openAt, now)}.`];
    const messages = [];

    for (const option of options) {
      const until = openAt - option.gap;
      if (until > now + 15000) {
        lines.push(`${option.name} until ${formatWhen(until, now)}.`);
        messages.push({ at: until, kind: option.kind, body: reminderBody(option.kind, openAt, now) });
      } else {
        lines.push(`${option.name} now would move practice to ${formatSpan(option.gap)} from when you finish.`);
      }
    }

    lines.push("Water any time.");
    messages.push({ at: openAt, kind: "open", body: CAN_PRACTICE });
    messages.sort((a, b) => a.at - b.at);
    return { ready: false, openAt, nowText: lines.join("\n"), messages };
  }

  function stepState(steps, elapsedMs) {
    const list = steps || [];
    const totalMs = list.reduce((sum, step) => sum + step.seconds * 1000, 0);
    if (!list.length) return { index: -1, leftMs: 0, finished: false, totalMs: 0 };
    if (elapsedMs >= totalMs) {
      return { index: list.length - 1, leftMs: 0, finished: true, totalMs };
    }
    let cursor = elapsedMs;
    for (let index = 0; index < list.length; index += 1) {
      const duration = list[index].seconds * 1000;
      if (cursor < duration) {
        return { index, leftMs: duration - cursor, finished: false, totalMs };
      }
      cursor -= duration;
    }
    return { index: list.length - 1, leftMs: 0, finished: true, totalMs };
  }

  globalThis.KriyaRules = {
    START,
    END,
    TWICE_DAYS,
    GAP_MS,
    CAN_PRACTICE,
    dayKey,
    startOfDay,
    programStart,
    programEnd,
    dayIndex,
    requiredOn,
    programLengthDays,
    gapFor,
    bindingWait,
    activeWaits,
    formatWhen,
    formatSpan,
    formatClock,
    allowance,
    stepState,
    pad,
  };
})();

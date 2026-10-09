(function () {
  const R = globalThis.KriyaRules;
  const KEY = "kriya.practice.v1";
  const $ = (id) => document.getElementById(id);

  const ui = {
    count: $("count"),
    snackLine: $("snack-line"),
    running: $("running"),
    runningClock: $("running-clock"),
    startGuide: $("start-guide"),
    todayCount: $("today-count"),
    mealList: $("meal-list"),
    messages: $("messages"),
    reminders: $("reminders"),
    daysDate: $("days-date"),
    daysSub: $("days-sub"),
    months: $("months"),
    timings: $("timings"),
    session: $("session"),
    stepKicker: $("step-kicker"),
    stepName: $("step-name"),
    elapsed: $("elapsed"),
    stepLeftTime: $("step-left-time"),
    stepLeftLabel: $("step-left-label"),
    markNote: $("mark-note"),
    scrub: $("scrub"),
    timeline: $("timeline"),
    pauseKriya: $("pause-kriya"),
    soundToggle: $("sound-toggle"),
    watch: $("watch"),
    watchToggle: $("watch-toggle"),
    sessionTimings: $("session-timings"),
    saveWhen: $("save-when"),
    mark: $("mark"),
  };

  let state = load();
  let daysScope = "month";
  let swReg = null;
  let lastCue = null;
  let markMissing = false;
  const timers = [];

  ui.mark.addEventListener("error", () => {
    markMissing = true;
    ui.markNote.hidden = false;
  });
  ui.mark.addEventListener("canplay", () => {
    markMissing = false;
    ui.markNote.hidden = true;
  });

  function blank() {
    return { kriyas: [], meals: [], timings: [], session: null, soundOn: true, reminders: false, kriyaAsk: null, daysMarked: false };
  }

  function normalizeAsk(ask) {
    if (!ask || typeof ask.day !== "string" || !Number.isFinite(ask.atCount)) return null;
    return { day: ask.day, atCount: ask.atCount };
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (!raw || typeof raw !== "object") return blank();
      return {
        kriyas: Array.isArray(raw.kriyas) ? raw.kriyas.filter((item) => item && Number.isFinite(item.at)) : [],
        meals: Array.isArray(raw.meals) ? raw.meals.filter((item) => item && Number.isFinite(item.finishedAt)) : [],
        timings: Array.isArray(raw.timings) ? raw.timings.filter((item) => item && Number.isFinite(item.seconds)) : [],
        session: normalizeSession(raw.session),
        soundOn: raw.soundOn !== false,
        reminders: raw.reminders === true,
        kriyaAsk: normalizeAsk(raw.kriyaAsk),
        daysMarked: raw.daysMarked === true,
      };
    } catch {
      return blank();
    }
  }

  function normalizeSession(session) {
    if (!session || !Number.isFinite(session.startedAt)) return null;
    const rate = Number(session.rate);
    const storedRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
    const paused = session.paused === true;
    let anchorWall = Number.isFinite(session.anchorWall) ? session.anchorWall : session.startedAt;
    let anchorElapsed = Number.isFinite(session.anchorElapsed) ? session.anchorElapsed : 0;
    if (!paused && storedRate !== 1) {
      anchorElapsed += (Date.now() - anchorWall) * storedRate;
      anchorWall = Date.now();
    }
    return {
      startedAt: session.startedAt,
      stopwatchStartedAt: Number.isFinite(session.stopwatchStartedAt) ? session.stopwatchStartedAt : null,
      anchorWall,
      anchorElapsed,
      rate: 1,
      paused,
    };
  }

  function guideElapsed(session, now) {
    if (!session) return 0;
    if (session.paused) return session.anchorElapsed;
    return session.anchorElapsed + (now - session.anchorWall) * session.rate;
  }

  let finishTimer = null;

  function clearFinishTimer() {
    if (!finishTimer) return;
    clearTimeout(finishTimer);
    finishTimer = null;
  }

  function stopAtEnd(now) {
    if (!state.session) return false;
    const total = totalMs(steps());
    if (!total || guideElapsed(state.session, now) < total) return false;
    clearFinishTimer();
    if (state.session.paused && state.session.anchorElapsed === total) return true;
    state.session.anchorElapsed = total;
    state.session.anchorWall = now;
    state.session.paused = true;
    save();
    return true;
  }

  function armFinish(now) {
    clearFinishTimer();
    if (!state.session || state.session.paused) return;
    const total = totalMs(steps());
    if (!total) return;
    const elapsed = guideElapsed(state.session, now);
    if (elapsed >= total) {
      stopAtEnd(now);
      return;
    }
    const wait = (total - elapsed) / state.session.rate;
    finishTimer = setTimeout(() => {
      finishTimer = null;
      const at = Date.now();
      if (!stopAtEnd(at)) return;
      cueNow = true;
      paintSession(at);
      cueNow = false;
      render();
    }, Math.max(0, wait));
  }

  function totalMs(guide) {
    return guide.reduce((sum, step) => sum + step.seconds * 1000, 0);
  }

  function stepStartMs(guide, index) {
    let ms = 0;
    for (let i = 0; i < index && i < guide.length; i += 1) ms += guide[i].seconds * 1000;
    return ms;
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function toLocalInput(ms) {
    const date = new Date(ms);
    return `${date.getFullYear()}-${R.pad(date.getMonth() + 1)}-${R.pad(date.getDate())}T${R.pad(date.getHours())}:${R.pad(date.getMinutes())}`;
  }

  function fromLocalInput(value) {
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? Date.now() : time;
  }

  function formatWhen(ms) {
    const date = new Date(ms);
    const day = `${date.getDate()}.${R.pad(date.getMonth() + 1)}.${date.getFullYear()}`;
    const time = `${R.pad(date.getHours())}:${R.pad(date.getMinutes())}`;
    const today = R.dayKey(new Date());
    return R.dayKey(date) === today ? time : `${day} ${time}`;
  }

  function formatDay(date) {
    return `${date.getDate()}.${R.pad(date.getMonth() + 1)}.${date.getFullYear()}`;
  }

  function steps() {
    return Array.isArray(window.KRIYA_STEPS) ? window.KRIYA_STEPS.filter((step) => step && step.seconds > 0) : [];
  }

  function kindLabel(kind) {
    if (kind === "meal") return "Meal";
    if (kind === "snack") return "Snack";
    if (kind === "beverage") return "Tea, coffee, juice";
    if (kind === "water") return "Water";
    return "Kriya";
  }

  function waitLabel(row) {
    if (row.type === "kriya") return `Previous kriya · clears ${formatWhen(row.until)}`;
    const name = row.meal.what ? `${kindLabel(row.meal.kind)} · ${row.meal.what}` : kindLabel(row.meal.kind);
    return `${name} · clears ${formatWhen(row.until)}`;
  }

  function migrateLastKriya() {
    if (!state.kriyas.length) return;
    const latest = state.kriyas.reduce((best, item) => (item.at > best.at ? item : best));
    if (Number.isFinite(latest.finishedAt)) return;
    const total = totalMs(steps());
    if (!total) return;
    const session = state.session;
    const tiedToSession = session && Math.abs(session.startedAt - latest.at) < 2 * 60 * 1000;
    latest.finishedAt = tiedToSession
      ? R.sessionFinishAt(session, total, Date.now())
      : latest.at + total;
    save();
  }

  function markPastDays() {
    if (state.daysMarked) return;
    const added = R.markedDays(state.kriyas, new Date());
    for (const item of added) {
      state.kriyas.push({ id: uid(), at: item.at, finishedAt: item.finishedAt });
    }
    state.daysMarked = true;
    save();
  }

  function waitKriyas(now) {
    if (!state.session) return state.kriyas;
    const finishedAt = R.sessionFinishAt(state.session, totalMs(steps()), now);
    return state.kriyas.concat([{ id: "running", at: state.session.startedAt, finishedAt }]);
  }

  function todayKriyas(now) {
    const date = now instanceof Date ? now : new Date(now);
    const key = R.dayKey(date);
    return state.kriyas
      .filter((item) => R.dayKey(new Date(item.at)) === key)
      .sort((a, b) => a.at - b.at);
  }

  function dayFinished(now) {
    const date = now instanceof Date ? now : new Date(now);
    const required = R.requiredOn(date);
    return required > 0 && todayKriyas(date).length >= required;
  }

  function paintLive() {
    const now = Date.now();
    const wait = R.bindingWait(now, state.meals, waitKriyas(now));
    if (dayFinished(now)) {
      ui.count.textContent = "Done";
      ui.snackLine.textContent = "";
      ui.snackLine.hidden = true;
      paintFood(now, { ready: true, openAt: now });
    } else {
      ui.count.textContent = wait.ready ? "Now" : formatWhen(wait.openAt);
      const limits = R.allowance(now, state.meals, waitKriyas(now)).nowText
        .split("\n")
        .filter((line) => line.includes(" until "))
        .map((line) => {
          const clean = line.replace(/^A /, "").replace(/\.$/, "");
          return clean.charAt(0).toUpperCase() + clean.slice(1);
        });
      ui.snackLine.textContent = limits.join(". ");
      ui.snackLine.hidden = limits.length === 0;
      paintFood(now, wait);
    }

    if (state.session) {
      stopAtEnd(now);
      const elapsed = guideElapsed(state.session, now);
      const done = totalMs(steps()) > 0 && elapsed >= totalMs(steps());
      if (done) ui.runningClock.textContent = "Finished";
      else if (state.session.paused) ui.runningClock.textContent = "Paused";
      else ui.runningClock.textContent = R.formatClock(elapsed);
      paintSession(now);
    }
  }

  function paintFood(now, wait) {
    const kinds = ["meal", "snack", "beverage", "water"];
    for (const kind of kinds) {
      const node = document.getElementById(`food-${kind}`);
      if (!node) continue;
      if (kind === "water" || wait.ready) {
        node.textContent = "open";
        continue;
      }
      const until = wait.openAt - R.GAP_MS[kind];
      node.textContent = until > now + 15000 ? `${formatLeft(until - now)} left` : "closed";
    }
  }

  function formatLeft(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return `${h}:${R.pad(m)}`;
    return `${m}:${R.pad(s)}`;
  }

  function formatWatch(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return `${h}:${R.pad(m)}:${R.pad(s)}`;
    return `${R.pad(m)}:${R.pad(s)}`;
  }

  function showView(name) {
    for (const id of ["kriya", "food", "days", "records"]) {
      const view = document.getElementById(`view-${id}`);
      const on = id === name;
      view.classList.toggle("on", on);
      view.hidden = !on;
      view.style.setProperty("display", on ? (id === "kriya" ? "flex" : "block") : "none", "important");
      const button = document.querySelector(`.nav [data-view="${id}"]`);
      if (id === name) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
  }

  function render() {
    const now = new Date();
    const required = R.requiredOn(now);
    const index = R.dayIndex(now);
    const length = R.programLengthDays();
    if (required === 0 && index < 0) {
      ui.daysDate.textContent = "20.09.2026";
      ui.daysSub.textContent = "day 1 of " + length + " · two kriyas today";
    } else if (required === 0) {
      ui.daysDate.textContent = "20.03.2027";
      ui.daysSub.textContent = "the practice ended";
    } else {
      ui.daysDate.textContent = formatDay(now);
      ui.daysSub.textContent = `day ${index + 1} of ${length} · ${required === 2 ? "two kriyas today" : "one kriya today"}`;
    }

    const logged = todayKriyas(now);
    ui.todayCount.hidden = required === 0;
    ui.todayCount.textContent = required ? `${logged.length} of ${required} is done` : "";
    paintAsk(now, required, logged);

    fillMeals();

    const finished = dayFinished(now);
    const shortMessage = { meal: "no more meals", snack: "no more snacks", beverage: "only water" };
    const messages = finished
      ? []
      : R.allowance(Date.now(), state.meals, waitKriyas(Date.now())).messages
        .filter((message) => shortMessage[message.kind]);
    ui.messages.hidden = messages.length === 0;
    ui.messages.replaceChildren();
    for (const message of messages) {
      ui.messages.append(el("li", {}, `${formatWhen(message.at)} · ${shortMessage[message.kind]}`));
    }
    ui.reminders.setAttribute("aria-pressed", state.reminders ? "true" : "false");
    ui.reminders.setAttribute("aria-label", state.reminders ? "Reminders on" : "Turn on reminders");

    ui.running.hidden = !state.session;
    ui.startGuide.textContent = state.session ? "Guidance is running" : "Begin";
    ui.startGuide.disabled = Boolean(state.session);

    renderMonths(now);
    renderTodayKriyas(ui.timings);
    renderTimings(ui.sessionTimings, false);
    paintLive();
    if (!ui.session.hidden) paintSession(Date.now());
  }

  function paintAsk(now, required, logged) {
    const ask = $("kriya-ask");
    const missing = required - logged.length;
    const dismissed = state.kriyaAsk
      && state.kriyaAsk.day === R.dayKey(now)
      && state.kriyaAsk.atCount === logged.length;
    if (missing <= 0 || dismissed) {
      ask.hidden = true;
      $("missing-form").hidden = true;
      return;
    }
    ask.hidden = false;
    $("kriya-ask-text").textContent = missing === 1
      ? "One kriya is not logged."
      : "Two kriyas are not logged.";
  }

  function fillMeals() {
    const list = ui.mealList;
    if (!list) return;
    const todayKey = R.dayKey(new Date());
    const nowMs = Date.now();
    const meals = state.meals
      .filter((item) => {
        if (R.dayKey(new Date(item.finishedAt)) === todayKey) return true;
        const gap = R.gapFor(item.kind);
        return gap > 0 && item.finishedAt + gap > nowMs;
      })
      .sort((a, b) => b.finishedAt - a.finishedAt);
    list.replaceChildren();
    if (!meals.length) {
      list.hidden = true;
      return;
    }
    list.hidden = false;
    for (const item of meals) {
      const name = item.what ? `${kindLabel(item.kind)} · ${item.what}` : kindLabel(item.kind);
      const button = el("button", { type: "button", class: "danger", "data-action": "delete-meal", "data-id": item.id }, "Delete");
      list.append(el(
        "li",
        {},
        el("span", { class: "meal-name" }, name),
        el("span", { class: "meal-when" }, el("strong", {}, formatWhen(item.finishedAt)), button)
      ));
    }
  }

  function fromTimeToday(value) {
    const now = new Date();
    const parts = String(value || "").split(":");
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Date.now();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0).getTime();
  }

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      node.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of children) {
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function renderMonths(now) {
    for (const button of document.querySelectorAll("#days-switch [data-scope]")) {
      button.setAttribute("aria-pressed", button.dataset.scope === daysScope ? "true" : "false");
    }
    ui.months.replaceChildren();
    const programStart = R.programStart();
    const end = R.programEnd();
    const todayKey = R.dayKey(now);
    const cursor = daysScope === "month"
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : new Date(programStart);
    if (cursor < programStart) cursor.setTime(programStart.getTime());
    while (cursor <= end) {
      if (daysScope === "month" && (cursor.getFullYear() !== now.getFullYear() || cursor.getMonth() !== now.getMonth())) break;
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const title = cursor.toLocaleString("en", { month: "long", year: "numeric" });
      const grid = el("div", { class: "grid" });
      for (const letter of ["M", "T", "W", "T", "F", "S", "S"]) grid.append(el("span", { class: "wd" }, letter));
      grid.append(el("div", { class: "wd-rule" }));
      const first = new Date(year, month, 1);
      const lead = (first.getDay() + 6) % 7;
      for (let i = 0; i < lead; i += 1) grid.append(el("div", { class: "cell empty" }));
      const days = new Date(year, month + 1, 0).getDate();
      for (let day = 1; day <= days; day += 1) {
        const date = new Date(year, month, day);
        if (date < R.programStart() || date > end) {
          grid.append(el("div", { class: "cell later" }, el("b", {}, String(day))));
          continue;
        }
        const key = R.dayKey(date);
        const need = R.requiredOn(date);
        const done = state.kriyas.filter((item) => R.dayKey(new Date(item.at)) === key).length;
        const future = key > todayKey;
        let klass = "cell";
        if (key === todayKey) klass += " today";
        if (future) klass += " later";
        else if (done >= need) klass += " ok";
        else if (key < todayKey) klass += " short";
        const cell = el("div", { class: klass }, el("b", {}, String(day)));
        cell.title = `${formatDay(date)} · ${done} of ${need}`;
        grid.append(cell);
      }
      const block = el("section", { class: "month" });
      if (daysScope === "all") block.append(el("h3", {}, title));
      block.append(grid);
      ui.months.append(block);
      cursor.setMonth(cursor.getMonth() + 1, 1);
    }
  }

  function renderTodayKriyas(list) {
    const todayKey = R.dayKey(new Date());
    const rows = state.kriyas
      .filter((item) => R.dayKey(new Date(item.at)) === todayKey)
      .sort((a, b) => b.at - a.at);
    list.replaceChildren();
    if (!rows.length) {
      list.append(el("li", {}, "Nothing saved yet."));
      return;
    }
    for (const item of rows) {
      const remove = el("button", { type: "button", class: "danger", "data-action": "delete-kriya", "data-id": item.id }, "Delete");
      list.append(el("li", {}, el("span", {}, "Kriya"), el("strong", {}, formatWhen(item.at)), remove));
    }
  }

  function renderTimings(list, asRecord) {
    const rows = state.timings.slice().sort((a, b) => b.at - a.at);
    list.replaceChildren();
    if (!rows.length) {
      list.append(el("li", {}, "Nothing saved yet."));
      return;
    }
    for (const item of rows) {
      const time = R.formatClock(item.seconds * 1000);
      const remove = el("button", { type: "button", class: "danger", "data-action": "delete-timing", "data-id": item.id }, "Delete");
      if (asRecord) {
        list.append(el("li", {}, el("span", {}, formatWhen(item.at)), el("strong", {}, time), remove));
      } else {
        list.append(el("li", {}, el("span", {}, `${formatWhen(item.at)} · ${time}`), remove));
      }
    }
  }

  let saveTimeEdited = false;
  let draggingScrub = false;
  let shownStep = -1;
  let cueNow = false;

  function paintSession(now) {
    if (!state.session) return;
    stopAtEnd(now);
    const elapsed = guideElapsed(state.session, now);
    const guide = steps();
    const step = R.stepState(guide, elapsed);
    ui.elapsed.textContent = R.formatClock(Math.max(0, elapsed));
    ui.pauseKriya.setAttribute("aria-label", state.session.paused ? "Continue" : "Pause");
    ui.pauseKriya.setAttribute("aria-pressed", state.session.paused ? "true" : "false");
    ui.soundToggle.textContent = state.soundOn ? "Sound on" : "Sound off";
    ui.markNote.hidden = !markMissing;
    if (guide.length && !draggingScrub) {
      const total = totalMs(guide);
      ui.scrub.value = String(total ? Math.round((Math.min(elapsed, total) / total) * 1000) : 0);
    }
    if (ui.timeline.dataset.count !== String(guide.length)) buildTimeline(guide);
    markCurrentPart(step.index);
    if (!guide.length) {
      ui.stepKicker.textContent = "No steps yet";
      ui.stepName.textContent = "Open practice";
      paintStepLeft("", "Add timings in data/steps.js. The clock is running.");
    } else if (step.finished) {
      const last = guide[step.index];
      ui.stepKicker.textContent = "Steps finished";
      ui.stepName.textContent = last.line || last.name;
      paintStepLeft("", "Finished.");
    } else {
      const current = guide[step.index];
      const place = `${step.index + 1} of ${guide.length}`;
      ui.stepName.textContent = current.line || current.name;
      ui.stepKicker.textContent = current.section && current.section !== "Change"
        ? `${current.section} · ${place}`
        : place;
      paintStepLeft(
        R.formatClock(step.leftMs),
        state.session.paused ? "Paused" : "left in this step"
      );
    }
    syncCue(elapsed, step, guide);
    if (state.session.stopwatchStartedAt) {
      ui.watch.textContent = formatWatch(now - state.session.stopwatchStartedAt);
      ui.watchToggle.textContent = "Stop";
    } else {
      ui.watch.textContent = "00:00";
      ui.watchToggle.textContent = "Start";
    }
    paintSaveTime(now);
  }

  function paintStepLeft(time, label) {
    ui.stepLeftTime.hidden = !time;
    ui.stepLeftTime.textContent = time;
    ui.stepLeftLabel.textContent = label;
  }

  function buildTimeline(guide) {
    ui.timeline.dataset.count = String(guide.length);
    shownStep = -1;
    ui.timeline.replaceChildren();
    guide.forEach((step, index) => {
      if (step.section === "Change") {
        ui.timeline.append(el(
          "button",
          { type: "button", class: "tl-gap", "data-step": String(index), title: "10 seconds" },
          "0:10"
        ));
        return;
      }
      ui.timeline.append(el(
        "button",
        { type: "button", "data-step": String(index), title: step.name },
        el("span", { class: "tl-name" }, step.line || step.name),
        el("span", { class: "tl-time" }, R.formatClock(step.seconds * 1000))
      ));
    });
  }

  function markCurrentPart(index) {
    for (const button of ui.timeline.querySelectorAll("[data-step]")) {
      const stepIndex = Number(button.dataset.step);
      const on = stepIndex === index;
      button.classList.toggle("is-current", on);
      button.classList.toggle("is-done", stepIndex < index);
      if (on) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    }
    if (index !== shownStep) {
      shownStep = index;
      const onLine = ui.timeline.querySelector(`[data-step="${index}"]`);
      if (onLine) {
        const left = onLine.offsetLeft - (ui.timeline.clientWidth - onLine.offsetWidth) / 2;
        ui.timeline.scrollTo({ left: Math.max(0, left) });
      }
    }
  }

  function placeSession(elapsed) {
    const now = Date.now();
    state.session.anchorElapsed = elapsed;
    state.session.anchorWall = now;
    const total = totalMs(steps());
    if (total && elapsed >= total) state.session.paused = true;
    save();
    cueNow = true;
    paintSession(now);
    cueNow = false;
    armFinish(now);
  }

  function seekTo(ms) {
    if (!state.session) return;
    const total = totalMs(steps());
    placeSession(Math.max(0, Math.min(ms, total)));
  }

  function syncCue(elapsed, step, guide) {
    if (!guide.length) return;
    const cue = step.finished ? "done" : String(step.index);
    if (cue === lastCue) return;
    const resumed = lastCue === null;
    lastCue = cue;
    if (!cueNow && resumed && elapsed > 1500) return;
    if (state.soundOn) playMark();
  }

  function playMark() {
    if (markMissing) {
      ui.markNote.hidden = false;
      return;
    }
    ui.mark.currentTime = 0;
    ui.mark.play().catch(() => {
      markMissing = true;
      ui.markNote.hidden = false;
    });
  }

  function paintSaveTime(now) {
    if (!state.session || saveTimeEdited) return;
    const next = toLocalInput(R.sessionFinishAt(state.session, totalMs(steps()), now));
    if (ui.saveWhen.value !== next) ui.saveWhen.value = next;
  }

  function openSession() {
    ui.session.hidden = false;
    paintSaveTime(Date.now());
    paintSession(Date.now());
  }

  function closeSessionView() {
    ui.session.hidden = true;
    render();
  }

  function commit() {
    save();
    render();
    scheduleReminders();
  }

  $("did-one").addEventListener("click", () => {
    const finishedAt = state.session
      ? R.sessionFinishAt(state.session, totalMs(steps()), Date.now())
      : Date.now();
    state.kriyas.push({ id: uid(), at: finishedAt, finishedAt });
    commit();
    tell();
  });

  $("log-missing").addEventListener("click", () => {
    const form = $("missing-form");
    form.hidden = false;
    const now = new Date();
    $("missing-when").value = `${R.pad(now.getHours())}:${R.pad(now.getMinutes())}`;
  });

  $("still-to-do").addEventListener("click", () => {
    const now = new Date();
    state.kriyaAsk = { day: R.dayKey(now), atCount: todayKriyas(now).length };
    commit();
  });

  $("missing-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const finishedAt = fromTimeToday($("missing-when").value);
    state.kriyas.push({ id: uid(), at: finishedAt, finishedAt });
    state.kriyaAsk = null;
    $("missing-form").hidden = true;
    commit();
    tell();
  });

  $("days-switch").addEventListener("click", (event) => {
    const button = event.target.closest("[data-scope]");
    if (!button) return;
    daysScope = button.dataset.scope;
    render();
  });

  $("food-buttons").addEventListener("click", (event) => {
    const button = event.target.closest("[data-food]");
    if (!button) return;
    state.meals.push({
      id: uid(),
      kind: button.dataset.food,
      what: "",
      finishedAt: Date.now(),
    });
    commit();
    tell();
  });

  $("forgot-food").addEventListener("click", () => {
    $("forgot-form").hidden = false;
    $("forgot-when").value = toLocalInput(Date.now());
    $("forgot-note").hidden = true;
  });

  $("forgot-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const kind = $("forgot-kind").value;
    const finishedAt = new Date($("forgot-when").value).getTime();
    const note = $("forgot-note");
    if (!["meal", "snack", "beverage", "water"].includes(kind) || Number.isNaN(finishedAt)) {
      note.hidden = false;
      note.textContent = "Enter the time you finished.";
      return;
    }
    if (finishedAt > Date.now() + 60 * 1000) {
      note.hidden = false;
      note.textContent = "That time has not happened yet.";
      return;
    }
    state.meals.push({ id: uid(), kind, what: "", finishedAt });
    $("forgot-form").hidden = true;
    note.hidden = true;
    commit();
    tell();
  });

  $("start-guide").addEventListener("click", () => {
    if (state.session) {
      openSession();
      return;
    }
    saveTimeEdited = false;
    const started = Date.now();
    state.session = {
      startedAt: started,
      stopwatchStartedAt: null,
      anchorWall: started,
      anchorElapsed: 0,
      rate: 1,
      paused: false,
    };
    lastCue = null;
    commit();
    openSession();
  });

  $("open-guide").addEventListener("click", openSession);
  $("close-session").addEventListener("click", closeSessionView);

  $("discard-session").addEventListener("click", () => {
    if (!arm($("discard-session"))) return;
    state.session = null;
    lastCue = null;
    clearFinishTimer();
    commit();
    closeSessionView();
  });

  ui.saveWhen.addEventListener("input", () => {
    saveTimeEdited = true;
  });

  $("save-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const finishedAt = saveTimeEdited
      ? fromLocalInput(ui.saveWhen.value)
      : R.sessionFinishAt(state.session, totalMs(steps()), Date.now());
    state.kriyas.push({ id: uid(), at: finishedAt, finishedAt });
    state.session = null;
    lastCue = null;
    clearFinishTimer();
    commit();
    tell();
    closeSessionView();
  });

  ui.scrub.addEventListener("pointerdown", () => {
    draggingScrub = true;
  });
  ui.scrub.addEventListener("pointerup", () => {
    draggingScrub = false;
  });
  ui.scrub.addEventListener("pointercancel", () => {
    draggingScrub = false;
  });
  ui.scrub.addEventListener("input", () => {
    draggingScrub = true;
    const total = totalMs(steps());
    seekTo((Number(ui.scrub.value) / 1000) * total);
  });
  ui.scrub.addEventListener("change", () => {
    draggingScrub = false;
  });

  ui.pauseKriya.addEventListener("click", () => {
    if (!state.session) return;
    const now = Date.now();
    const total = totalMs(steps());
    if (total && guideElapsed(state.session, now) >= total) {
      stopAtEnd(now);
      paintSession(now);
      return;
    }
    state.session.anchorElapsed = guideElapsed(state.session, now);
    state.session.anchorWall = now;
    state.session.paused = !state.session.paused;
    save();
    paintSession(now);
    if (state.session.paused) clearFinishTimer();
    else armFinish(now);
  });

  document.querySelector(".nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    showView(button.dataset.view);
  });

  function jumpToPart(event) {
    const button = event.target.closest("[data-step]");
    if (!button) return;
    seekTo(stepStartMs(steps(), Number(button.dataset.step)));
  }

  ui.timeline.addEventListener("click", jumpToPart);

  ui.soundToggle.addEventListener("click", () => {
    state.soundOn = !state.soundOn;
    save();
    ui.soundToggle.textContent = state.soundOn ? "Sound on" : "Sound off";
  });

  ui.watchToggle.addEventListener("click", () => {
    if (!state.session) return;
    if (state.session.stopwatchStartedAt) {
      const seconds = Math.max(1, Math.round((Date.now() - state.session.stopwatchStartedAt) / 1000));
      state.timings.push({
        id: uid(),
        at: Date.now(),
        seconds,
        sessionStartedAt: state.session.startedAt,
      });
      state.session.stopwatchStartedAt = null;
    } else {
      state.session.stopwatchStartedAt = Date.now();
    }
    commit();
    paintSession(Date.now());
  });

  ui.reminders.addEventListener("click", async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    state.reminders = permission === "granted";
    commit();
  });

  document.body.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (!arm(button)) return;
    const id = button.dataset.id;
    if (button.dataset.action === "delete-kriya") state.kriyas = state.kriyas.filter((item) => item.id !== id);
    if (button.dataset.action === "delete-meal") state.meals = state.meals.filter((item) => item.id !== id);
    if (button.dataset.action === "delete-timing") state.timings = state.timings.filter((item) => item.id !== id);
    const changesWait = button.dataset.action === "delete-kriya" || button.dataset.action === "delete-meal";
    commit();
    if (changesWait) tell();
  });

  function arm(button) {
    if (button.dataset.armed === "1") {
      button.dataset.armed = "0";
      button.textContent = button.dataset.label || button.textContent;
      return true;
    }
    button.dataset.label = button.textContent;
    button.dataset.armed = "1";
    button.textContent = "Confirm";
    setTimeout(() => {
      if (button.dataset.armed === "1") {
        button.dataset.armed = "0";
        button.textContent = button.dataset.label;
      }
    }, 2500);
    return false;
  }

  function notifyNow(body) {
    if (!state.reminders || Notification.permission !== "granted") return;
    if (swReg) swReg.showNotification("Kriya", { body, tag: `kriya-now-${Date.now()}` });
    else new Notification("Kriya", { body });
  }

  async function scheduleReminders() {
    for (const timer of timers) clearTimeout(timer);
    timers.length = 0;
    if (!state.reminders || !("Notification" in window) || Notification.permission !== "granted") return;

    if (swReg && swReg.getNotifications) {
      try {
        const existing = await swReg.getNotifications({ includeTriggered: true });
        for (const note of existing) {
          if (String(note.tag || "").startsWith("kriya-")) note.close();
        }
      } catch {
        /* Older browsers have no includeTriggered. */
      }
    }

    const now = Date.now();
    for (const message of R.allowance(now, state.meals, waitKriyas(now)).messages) {
      if (message.at > now) scheduleAt(message.at, `kriya-${message.kind}`, message.body);
    }
  }

  function tell() {
    const text = R.allowance(Date.now(), state.meals, waitKriyas(Date.now())).nowText;
    if (text) notifyNow(text);
  }

  function scheduleAt(when, tag, body) {
    const delay = when - Date.now();
    if (delay <= 0) return;
    if (swReg && typeof TimestampTrigger === "function") {
      swReg.showNotification("Kriya", {
        body,
        tag,
        showTrigger: new TimestampTrigger(when),
      }).catch(() => queueTimeout(delay, tag, body));
      return;
    }
    queueTimeout(delay, tag, body);
  }

  function queueTimeout(delay, tag, body) {
    if (delay > 2147483647) return;
    timers.push(setTimeout(() => {
      if (swReg) swReg.showNotification("Kriya", { body, tag });
      else if (Notification.permission === "granted") new Notification("Kriya", { body, tag });
    }, delay));
  }

  migrateLastKriya();
  markPastDays();
  showView("kriya");
  render();
  armFinish(Date.now());
  setInterval(paintLive, 1000);

  if ("serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      swReg = reg;
      scheduleReminders();
    }).catch(() => {});
  } else {
    scheduleReminders();
  }
})();

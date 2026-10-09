import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const sandbox = {};
vm.runInNewContext(fs.readFileSync(new URL("../js/rules.js", import.meta.url), "utf8"), sandbox);
const R = sandbox.KriyaRules;

test("forty days of two, then one, through half a year from 20 Sep 2026", () => {
  assert.equal(R.requiredOn(new Date(2026, 8, 19)), 0);
  assert.equal(R.requiredOn(new Date(2026, 8, 20)), 2);
  assert.equal(R.dayIndex(new Date(2026, 8, 23)), 3);
  assert.equal(R.dayIndex(new Date(2026, 9, 29)), 39);
  assert.equal(R.requiredOn(new Date(2026, 9, 29)), 2);
  assert.equal(R.requiredOn(new Date(2026, 9, 30)), 1);
  assert.equal(R.requiredOn(new Date(2027, 2, 20)), 1);
  assert.equal(R.requiredOn(new Date(2027, 2, 21)), 0);
  assert.equal(R.programEnd().getDate(), 20);
  assert.equal(R.programLengthDays(), 182);
});

test("the wait is the latest of food and the previous kriya", () => {
  const mealAt = new Date(2026, 8, 21, 8, 0).getTime();
  const meals = [{ id: "m", kind: "meal", what: "lunch", finishedAt: mealAt }];
  const open = R.bindingWait(mealAt, meals, []);
  assert.equal(open.ready, false);
  assert.equal(open.openAt - mealAt, R.GAP_MS.meal);

  const snackAt = mealAt + 60 * 60 * 1000;
  const withSnack = meals.concat([{ id: "s", kind: "snack", what: "fruit", finishedAt: snackAt }]);
  const snackOpen = R.bindingWait(snackAt, withSnack, []);
  assert.equal(snackOpen.openAt, mealAt + R.GAP_MS.meal);

  const teaAt = mealAt + 3 * 60 * 60 * 1000;
  const withTea = meals.concat([{ id: "t", kind: "beverage", what: "tea", finishedAt: teaAt }]);
  const teaOpen = R.bindingWait(teaAt, withTea, []);
  assert.equal(teaOpen.openAt, teaAt + R.GAP_MS.beverage);

  const water = meals.concat([{ id: "w", kind: "water", what: "water", finishedAt: teaAt }]);
  assert.equal(R.bindingWait(teaAt, water, []).openAt, mealAt + R.GAP_MS.meal);

  const kriyaAt = mealAt;
  const both = R.bindingWait(mealAt, meals, [{ id: "k", at: kriyaAt }]);
  assert.equal(both.openAt, mealAt + R.GAP_MS.kriya);
});

test("after food, the message says what is still allowed and the clock time it stops", () => {
  const finishedAt = new Date(2026, 8, 21, 12, 0).getTime();
  const meals = [{ id: "m", kind: "meal", what: "rice", finishedAt }];
  const plan = R.allowance(finishedAt, meals, []);
  assert.equal(plan.openAt, finishedAt + R.GAP_MS.meal);
  assert.match(plan.nowText, /Practice at 16:00/);
  assert.match(plan.nowText, /A snack until 13:30/);
  assert.match(plan.nowText, /Tea, coffee, or juice until 14:30/);
  assert.match(plan.nowText, /Water any time/);
  assert.match(plan.nowText, /A meal now would move practice/);
  assert.equal(plan.messages.find((message) => message.kind === "snack").at, finishedAt + 1.5 * 60 * 60 * 1000);
  assert.equal(plan.messages.find((message) => message.kind === "beverage").at, finishedAt + 2.5 * 60 * 60 * 1000);
  assert.match(plan.messages.find((message) => message.kind === "beverage").body, /Only water/);
  assert.equal(plan.messages.find((message) => message.kind === "open").at, finishedAt + R.GAP_MS.meal);

  const laterKriya = [{ id: "k", at: finishedAt + 60 * 60 * 1000 }];
  const moved = R.allowance(finishedAt, meals, laterKriya);
  assert.equal(moved.openAt, finishedAt + 5 * 60 * 60 * 1000);
  assert.match(moved.nowText, /Practice at 17:00/);
  assert.match(moved.nowText, /A snack until 14:30/);
  assert.match(moved.nowText, /Tea, coffee, or juice until 15:30/);
});

test("four hours run from the finish of a kriya, not its start", () => {
  const started = new Date(2026, 8, 21, 6, 0).getTime();
  const totalMs = 34 * 60 * 1000;
  const session = {
    startedAt: started,
    anchorWall: started,
    anchorElapsed: 0,
    rate: 1,
    paused: false,
  };
  const finished = R.sessionFinishAt(session, totalMs, started);
  assert.equal(finished, started + totalMs);

  const fromFinish = R.bindingWait(started, [], [{ id: "k", at: started, finishedAt: finished }]);
  assert.equal(fromFinish.openAt, finished + R.GAP_MS.kriya);
  assert.equal(fromFinish.ready, false);

  const loggedOnlyAtStart = R.bindingWait(started, [], [{ id: "k", at: started }]);
  assert.equal(loggedOnlyAtStart.openAt, started + R.GAP_MS.kriya);

  const pausedAt = started + 10 * 60 * 1000;
  const paused = {
    startedAt: started,
    anchorWall: pausedAt,
    anchorElapsed: 10 * 60 * 1000,
    rate: 1,
    paused: true,
  };
  const later = pausedAt + 50 * 60 * 1000;
  assert.equal(R.sessionFinishAt(paused, totalMs, later), later + (totalMs - 10 * 60 * 1000));

  const done = {
    startedAt: started,
    anchorWall: started + totalMs,
    anchorElapsed: totalMs,
    rate: 1,
    paused: true,
  };
  assert.equal(R.sessionFinishAt(done, totalMs, started + totalMs + 60000), started + totalMs);
});

test("days through today are filled to two kriyas without closing practice", () => {
  const now = new Date(2026, 9, 9, 10, 30, 0, 0);
  const existing = [{ id: "kept", at: new Date(2026, 8, 21, 9, 0).getTime(), finishedAt: new Date(2026, 8, 21, 9, 0).getTime() }];
  const added = R.markedDays(existing, now);
  const all = existing.concat(added);
  const byDay = new Map();
  for (const item of all) {
    const key = R.dayKey(new Date(item.at));
    byDay.set(key, (byDay.get(key) || 0) + 1);
  }
  assert.equal(byDay.get("2026-09-19"), undefined);
  assert.equal(byDay.get("2026-09-20"), 2);
  assert.equal(byDay.get("2026-09-21"), 2);
  assert.equal(byDay.get("2026-10-09"), 2);
  assert.equal(byDay.get("2026-10-10"), undefined);
  assert.equal(byDay.size, 20);

  const open = R.bindingWait(now.getTime(), [], all);
  assert.equal(open.ready, true);
  for (const item of added) {
    assert.ok(item.finishedAt <= now.getTime() - R.GAP_MS.kriya);
  }
  assert.equal(R.markedDays(all, now).length, 0);
});

test("steps advance on the clock and then finish", () => {
  const steps = [
    { name: "One", seconds: 60 },
    { name: "Two", seconds: 30 },
  ];
  assert.equal(R.stepState(steps, 0).index, 0);
  assert.equal(R.stepState(steps, 60000).index, 1);
  assert.equal(R.stepState(steps, 90000).finished, true);
  assert.equal(R.stepState([], 1000).index, -1);
});

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

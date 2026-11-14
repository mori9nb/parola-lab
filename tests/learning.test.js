import test from "node:test";
import assert from "node:assert/strict";
import { seed, makeQuestion, schedule, chooseItems } from "../src/learning.js";
test("questions have four distinct choices and exactly one correct answer", () => {
  for (const item of seed) {
    for (const reverse of [true, false]) {
      const q = makeQuestion(item, seed, reverse);
      assert.equal(q.options.length, 4);
      assert.equal(new Set(q.options).size, 4);
      assert.equal(q.options.filter((x) => x === q.answer).length, 1);
    }
  }
});
test("insufficient unique meanings do not produce invalid quizzes", () => {
  assert.equal(makeQuestion(seed[0], seed.slice(0, 2)), null);
});
test("incorrect answers return sooner and reset the streak", () => {
  const a = schedule(null, true, 0);
  const b = schedule(a, true, 0);
  const c = schedule(b, false, 0);
  assert.equal(b.due, 172800000);
  assert.equal(c.due, 600000);
  assert.equal(c.streak, 0);
  assert.equal(c.correct, 2);
  assert.equal(c.attempts, 3);
});
test("due and unseen items precede future reviews", () => {
  const p = { 1: { due: 9999999999999 } };
  const result = chooseItems(seed.slice(0, 2), p);
  assert.equal(result[0].id, "2");
  assert.equal(result[1].id, "1");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  equalSplit,
  parseMoney,
  validateSplits,
  balances,
  simplifyDebts,
  expenseSchema,
} from "../shared/domain";
test("money stays exact and rejects ambiguous input", () => {
  assert.equal(parseMoney("0.29"), 29);
  assert.equal(parseMoney("12.3"), 1230);
  for (const v of ["1.005", "-2", "NaN", "1e3", "0", "1,000", "1000001"])
    assert.throws(() => parseMoney(v));
});
test("equal split conserves every cent, including remainder", () => {
  for (let amount = 1; amount < 1000; amount++) {
    const parts = equalSplit(amount, ["a", "b", "c"]);
    assert.equal(
      parts.reduce((n, s) => n + s.amountMinor, 0),
      amount,
    );
    assert.ok(
      Math.max(...parts.map((s) => s.amountMinor)) -
        Math.min(...parts.map((s) => s.amountMinor)) <=
        1,
    );
  }
  assert.throws(() => equalSplit(100, []));
  assert.throws(() => equalSplit(100, ["a", "a"]));
});
test("splits must match the group and total", () => {
  const base = {
    title: "Lunch",
    amountMinor: 101,
    paidBy: "a",
    splits: equalSplit(101, ["a", "b"]),
    category: "Other" as const,
    spentOn: "2026-11-08",
  };
  validateSplits(base, ["a", "b"]);
  assert.throws(() =>
    validateSplits({ ...base, paidBy: "outsider" }, ["a", "b"]),
  );
  assert.throws(() =>
    validateSplits({ ...base, amountMinor: 100 }, ["a", "b"]),
  );
  assert.throws(() =>
    validateSplits(
      {
        ...base,
        splits: [
          { memberId: "a", amountMinor: 50 },
          { memberId: "a", amountMinor: 51 },
        ],
      },
      ["a", "b"],
    ),
  );
  assert.equal(
    expenseSchema.safeParse({ ...base, spentOn: "2026-02-30" }).success,
    false,
  );
});
test("settlements reduce balances and suggestions clear all debt", () => {
  const members = ["a", "b", "c"].map((id) => ({ id, name: id }));
  const expenses = [
    {
      paid_by: "a",
      amount_minor: 10001,
      splits: equalSplit(10001, ["a", "b", "c"]),
    },
    { paid_by: "b", amount_minor: 2356, splits: equalSplit(2356, ["a", "b"]) },
  ];
  const net = balances(members, expenses, []);
  assert.equal(
    Object.values(net).reduce((a, b) => a + b, 0),
    0,
  );
  const transfers = simplifyDebts(net);
  const settled = balances(
    members,
    expenses,
    transfers.map((t) => ({
      from_member: t.from,
      to_member: t.to,
      amount_minor: t.amountMinor,
    })),
  );
  assert.deepEqual(settled, { a: 0, b: 0, c: 0 });
  assert.deepEqual(
    balances(
      members,
      expenses.map((e) => ({ ...e, voided_at: "today" })),
      [],
    ),
    { a: 0, b: 0, c: 0 },
  );
});

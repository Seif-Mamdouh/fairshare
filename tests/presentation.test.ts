import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expenseImpact,
  overallBalances,
  expenseDate,
} from "../shared/presentation";
test("expense list shows the viewer net share, not the whole bill", () => {
  const e = {
    amount_minor: 101,
    paid_by: "a",
    splits: [
      { memberId: "a", amountMinor: 51 },
      { memberId: "b", amountMinor: 50 },
    ],
  };
  assert.equal(expenseImpact(e, "a"), 50);
  assert.equal(expenseImpact(e, "b"), -50);
  assert.equal(expenseImpact(e, "c"), 0);
  assert.equal(expenseImpact({ ...e, voided_at: "now" }, "a"), 0);
});
test("overall balances never combine different currencies", () => {
  const groups = [
    {
      currency: "USD",
      members: [{ id: "a", user_id: "u" }],
      balances: { a: 120 },
    },
    {
      currency: "EUR",
      members: [{ id: "b", user_id: "u" }],
      balances: { b: -50 },
    },
    {
      currency: "USD",
      members: [{ id: "c", user_id: "u" }],
      balances: { c: -20 },
    },
  ];
  assert.deepEqual(overallBalances(groups, "u"), { USD: 100, EUR: -50 });
});

test("expense dates accept both PostgreSQL date and serialized timestamp formats", () => {
  for (const value of ["2026-11-08", "2026-11-08T00:00:00.000Z"])
    assert.equal(expenseDate(value).getDate(), 8);
});

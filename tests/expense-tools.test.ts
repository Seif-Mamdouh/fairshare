import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import request from "supertest";
import { localDatabase } from "../server/db";
import { createApp } from "../server/app";
import {
  itemizedSplits,
  weightedSplit,
  validateSplits,
  expenseSchema,
} from "../shared/domain";
import { parseReceiptText } from "../shared/receipt-scan";
import { filterExpenses, spendingSummary } from "../shared/insights";
const auth = (key: string) => ({ Authorization: "Bearer " + key });
test("itemized shares allocate items, tax and tip exactly, including indivisible cents", () => {
  const items = {
    items: [
      { label: "Dinner A", amountMinor: 1001, memberIds: ["a"] },
      { label: "Shared", amountMinor: 1000, memberIds: ["a", "b"] },
    ],
    taxMinor: 151,
    tipMinor: 300,
  };
  const splits = itemizedSplits(items);
  assert.equal(
    splits.reduce((n, s) => n + s.amountMinor, 0),
    2452,
  );
  assert.deepEqual(splits, [
    { memberId: "a", amountMinor: 1839 },
    { memberId: "b", amountMinor: 613 },
  ]);
  assert.deepEqual(
    weightedSplit(101, [
      { memberId: "a", weight: 1 },
      { memberId: "b", weight: 1 },
    ]),
    [
      { memberId: "a", amountMinor: 51 },
      { memberId: "b", amountMinor: 50 },
    ],
  );
  assert.throws(() =>
    itemizedSplits({
      ...items,
      items: [{ label: "Invalid", amountMinor: 100, memberIds: ["a", "a"] }],
    }),
  );
  const expense = expenseSchema.parse({
    title: "Dinner",
    amountMinor: 2452,
    paidBy: "a",
    splits,
    category: "Food & drink",
    spentOn: "2026-11-10",
    itemization: items,
  });
  validateSplits(expense, ["a", "b"]);
  assert.throws(
    () =>
      validateSplits(
        { ...expense, splits: [{ memberId: "a", amountMinor: 2452 }] },
        ["a", "b"],
      ),
    /Itemized/,
  );
  assert.throws(() => validateSplits(expense, ["a"]), /belong/);
});
test("conversion records preserve original values and reject inconsistent ledger totals", () => {
  const expense = expenseSchema.parse({
    title: "Trip",
    amountMinor: 1100,
    paidBy: "a",
    splits: [{ memberId: "a", amountMinor: 1100 }],
    spentOn: "2026-11-10",
    conversion: {
      currency: "EUR",
      amountMinor: 1000,
      rate: 1.1,
      rateDate: "2026-11-09",
      source: "Manual",
    },
  });
  validateSplits(expense, ["a"]);
  assert.throws(
    () =>
      validateSplits(
        {
          ...expense,
          amountMinor: 1200,
          splits: [{ memberId: "a", amountMinor: 1200 }],
        },
        ["a"],
      ),
    /exchange rate/,
  );
});
test("receipt parser creates reviewable suggestions without guessing missing totals", () => {
  const draft = parseReceiptText(
    "CORNER CAFE\n11/10/2026\nCoffee 5.00\nLunch 10.00\nSUBTOTAL 15.00\nTAX 1.20\nTIP 3.00\nTOTAL 19.20\nVISA 19.20",
  );
  assert.equal(draft.title, "CORNER CAFE");
  assert.equal(draft.date, "2026-11-10");
  assert.equal(draft.amountMinor, 1920);
  assert.equal(draft.items.length, 2);
  assert.equal(draft.taxMinor, 120);
  assert.equal(draft.tipMinor, 300);
  assert.equal(
    parseReceiptText("Unknown shop\nCoffee 5.00").amountMinor,
    undefined,
  );
});
test("search and charts exclude removed expenses and find item text, people and ranges", () => {
  const members = [
    { id: "a", name: "Alex" },
    { id: "b", name: "Blair" },
  ];
  const rows = [
    {
      id: "1",
      title: "Dinner",
      category: "Food & drink",
      amount_minor: 1200,
      spent_on: "2026-11-10",
      paid_by: "a",
      splits: [{ memberId: "b", amountMinor: 1200 }],
      itemization: { items: [{ label: "Noodles" }] },
    },
    {
      id: "2",
      title: "Bus",
      category: "Transport",
      amount_minor: 300,
      spent_on: "2026-10-01",
      paid_by: "b",
      splits: [{ memberId: "b", amountMinor: 300 }],
    },
    {
      id: "3",
      title: "Removed",
      amount_minor: 99999,
      spent_on: "2026-11-10",
      voided_at: "now",
    },
  ];
  assert.equal(filterExpenses(rows, members, { text: "noodles" })[0].id, "1");
  assert.equal(filterExpenses(rows, members, { text: "alex" })[0].id, "1");
  assert.deepEqual(
    filterExpenses(rows, members, { from: "2026-11-01", minMinor: 1000 }).map(
      (e) => e.id,
    ),
    ["1"],
  );
  assert.equal(
    filterExpenses(rows, members, { category: "Transport", maxMinor: 200 })
      .length,
    0,
  );
  assert.equal(spendingSummary(rows).total, 1500);
  assert.deepEqual(spendingSummary(rows).months, [
    ["2026-10", 300],
    ["2026-11", 1200],
  ]);
});
test("expense metadata persists, split defaults stay private, and exchange lookup requires a workspace", async () => {
  const db = await localDatabase();
  const originalFetch = globalThis.fetch;
  try {
    for (const sql of (await readFile("server/schema.sql", "utf8"))
      .split(";")
      .filter((s) => s.trim()))
      await db.query(sql);
    const http = request(createApp(db));
    const a = (await http.post("/api/workspace").send({})).body,
      b = (await http.post("/api/workspace").send({})).body;
    const g = (
      await http
        .post("/api/groups")
        .set(auth(a.token))
        .send({ name: "Trip", currency: "USD" })
    ).body;
    const full = (await http.get("/api/groups/" + g.id).set(auth(a.token)))
      .body;
    const member = full.members[0].id;
    const preference = {
      paidBy: member,
      weights: [{ memberId: member, weight: 3 }],
    };
    await http
      .post("/api/groups/" + g.id + "/split-defaults")
      .set(auth(b.token))
      .send(preference)
      .expect(404);
    await http
      .post("/api/groups/" + g.id + "/split-defaults")
      .set(auth(a.token))
      .send({
        ...preference,
        weights: [...preference.weights, ...preference.weights],
      })
      .expect(400);
    await http
      .post("/api/groups/" + g.id + "/split-defaults")
      .set(auth(a.token))
      .send(preference)
      .expect(200);
    await http
      .post("/api/groups/join")
      .set(auth(b.token))
      .send({ inviteToken: full.invite_token })
      .expect(200);
    assert.deepEqual(
      (await http.get("/api/groups/" + g.id).set(auth(a.token))).body
        .splitDefaults,
      preference,
    );
    assert.equal(
      (await http.get("/api/groups/" + g.id).set(auth(b.token))).body
        .splitDefaults,
      null,
    );
    const itemization = {
      items: [{ label: "Coffee", amountMinor: 1000, memberIds: [member] }],
      taxMinor: 100,
      tipMinor: 200,
    };
    const expense = {
      title: "Cafe",
      amountMinor: 1300,
      paidBy: member,
      splits: [{ memberId: member, amountMinor: 1300 }],
      category: "Food & drink",
      spentOn: "2026-11-10",
      itemization,
    };
    const created = await http
      .post("/api/groups/" + g.id + "/expenses")
      .set(auth(a.token))
      .send(expense)
      .expect(201);
    assert.deepEqual(created.body.itemization, itemization);
    await http
      .post("/api/groups/" + g.id + "/expenses")
      .set(auth(a.token))
      .send({ ...expense, itemization: { ...itemization, taxMinor: 0 } })
      .expect(400);
    await http
      .delete("/api/groups/" + g.id + "/split-defaults")
      .set(auth(a.token))
      .expect(200);
    assert.equal(
      (await http.get("/api/groups/" + g.id).set(auth(a.token))).body
        .splitDefaults,
      null,
    );
    await http
      .get("/api/exchange-rate?from=USD&to=EUR&date=2026-11-10")
      .expect(401);
    globalThis.fetch = async (input: any) => {
      assert.match(
        String(input),
        /^https:\/\/api.frankfurter.dev\/v2\/rate\/usd\/eur\?date=2026-11-10$/,
      );
      return new Response(JSON.stringify({ rate: 0.9, date: "2026-11-10" }), {
        status: 200,
      });
    };
    const fx = await http
      .get("/api/exchange-rate?from=USD&to=EUR&date=2026-11-10")
      .set(auth(a.token))
      .expect(200);
    assert.equal(fx.body.rate, 0.9);
    await http
      .get("/api/exchange-rate?from=INVALID&to=EUR&date=2026-11-10")
      .set(auth(a.token))
      .expect(400);
  } finally {
    globalThis.fetch = originalFetch;
    await db.close();
  }
});

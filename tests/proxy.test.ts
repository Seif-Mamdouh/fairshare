import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../server/app";
import type { Database } from "../server/db";

test("Vercel request throttling separates clients, while local servers ignore forwarded IPs", async () => {
  const keys: string[] = [];
  const db: Database = {
    query: async (_sql, values) => {
      keys.push(String(values?.[0]));
      return { rows: [{ hits: 1 }] };
    },
    transaction: async (fn) => fn(db),
    close: async () => {},
  };
  const previous = process.env.VERCEL;
  try {
    process.env.VERCEL = "1";
    const proxied = createApp(db);
    for (const ip of ["192.0.2.1", "192.0.2.2"])
      await request(proxied)
        .post("/api/invites/preview")
        .set("X-Forwarded-For", ip)
        .send({ email: "invalid" })
        .expect(400);
    assert.notEqual(keys[0], keys[1]);
    keys.length = 0;
    delete process.env.VERCEL;
    const local = createApp(db);
    for (const ip of ["192.0.2.1", "192.0.2.2"])
      await request(local)
        .post("/api/invites/preview")
        .set("X-Forwarded-For", ip)
        .send({ email: "invalid" })
        .expect(400);
    assert.equal(keys[0], keys[1]);
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});

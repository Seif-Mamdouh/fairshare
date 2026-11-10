import { URL } from "node:url";
import "dotenv/config";
import { readFile } from "node:fs/promises";
import express from "express";
import { createApp } from "./app";
import { localDatabase, postgresDatabase } from "./db";
async function main() {
  const db = process.env.DATABASE_URL
    ? postgresDatabase(process.env.DATABASE_URL)
    : await localDatabase(process.env.LOCAL_DATABASE_PATH || "./work/database");
  for (const sql of (
    await readFile(new URL("./schema.sql", import.meta.url), "utf8")
  )
    .split(";")
    .filter((s) => s.trim()))
    await db.query(sql);
  const app = createApp(db, {
    oauthIssuer:
      process.env.OAUTH_ISSUER_URL ||
      `http://localhost:${process.env.PORT || 3001}`,
  });
  app.use(express.static("dist"));
  app.use(express.static("public"));
  app.get("/", (_req, res) =>
    res.send(
      "Fairshare API is ready. Start Expo with npm run web, or build with npm run build.",
    ),
  );
  const server = app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
    console.log(
      `Fairshare ready at http://localhost:${process.env.PORT || 3001}`,
    ),
  );
  const close = () =>
    server.close(() => void db.close().then(() => process.exit(0)));
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

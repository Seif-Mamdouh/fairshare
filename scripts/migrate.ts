import { URL } from "node:url";
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { postgresDatabase, localDatabase } from "../server/db";
async function main() {
  const db = process.env.DATABASE_URL
    ? postgresDatabase(process.env.DATABASE_URL)
    : await localDatabase(process.env.LOCAL_DATABASE_PATH || "./work/database");
  try {
    const sql = await readFile(
      new URL("../server/schema.sql", import.meta.url),
      "utf8",
    );
    for (const statement of sql.split(";").filter((s) => s.trim()))
      await db.query(statement);
    console.log("Schema applied successfully");
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

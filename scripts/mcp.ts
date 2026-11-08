import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { receiptSchema } from "../shared/domain";
async function main() {
  const base = process.env.FAIRSHARE_URL?.replace(/\/$/, "");
  const key = process.env.FAIRSHARE_AGENT_KEY;
  if (!base || !key)
    throw new Error("Set FAIRSHARE_URL and FAIRSHARE_AGENT_KEY.");
  if (
    !base.startsWith("https://") &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)
  )
    throw new Error("Use HTTPS outside localhost.");
  async function call(path: string, method = "GET", body?: unknown) {
    try {
      const response = await fetch(base + "/api/v1/agent" + path, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        isError: !response.ok,
      };
    } catch (e) {
      return {
        content: [{ type: "text" as const, text: (e as Error).message }],
        isError: true,
      };
    }
  }
  const server = new McpServer({
    name: "fairshare-receipts",
    version: "1.0.0",
  });
  server.registerTool(
    "get_group_context",
    {
      description:
        "Read the authorized group currency and member IDs before preparing a receipt.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => call("/context"),
  );
  server.registerTool(
    "submit_receipt",
    {
      description:
        "Submit a receipt draft for human review. Reuse sourceId for retries; the same sourceId with changed content is rejected. Amounts and splits are integer minor units. This does not create an expense until approved.",
      inputSchema: receiptSchema.shape,
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    (data) => call("/receipts", "POST", data),
  );
  server.registerTool(
    "get_receipt_status",
    {
      description:
        "Read the review status of a receipt submitted by this agent.",
      inputSchema: { receiptId: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    ({ receiptId }) => call("/receipts/" + encodeURIComponent(receiptId)),
  );
  await server.connect(new StdioServerTransport());
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

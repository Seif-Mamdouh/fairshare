import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { receiptSchema } from "../shared/domain";

export type AgentCall = (
  path: string,
  method?: string,
  body?: unknown,
) => Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }>;

/** One tool contract for hosted HTTP and the optional local stdio adapter. */
export function createReceiptMcpServer(call: AgentCall) {
  const server = new McpServer({
    name: "fairshare-receipts",
    version: "2.1.0",
  });
  server.registerTool(
    "get_group_context",
    {
      description:
        "Read this agent's authorized group currency and member IDs before preparing a receipt. No private bank data is exposed.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => call("/context"),
  );
  server.registerTool(
    "submit_receipt",
    {
      description:
        "Submit a receipt draft for human review. Reuse sourceId for identical retries; changed content with the same sourceId is rejected. Amounts and splits are integer minor units. This does not create an expense until a person approves it.",
      inputSchema: receiptSchema.shape,
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (data) => call("/receipts", "POST", data),
  );
  server.registerTool(
    "get_receipt_status",
    {
      description:
        "Read review status for a receipt submitted by this agent. Other agents' receipts are not accessible.",
      inputSchema: { receiptId: z.string().min(1).max(150) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ receiptId }) => call("/receipts/" + encodeURIComponent(receiptId)),
  );
  return server;
}

import "dotenv/config";
import { createReceiptMcpServer } from "../server/mcp-tools";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
  const server = createReceiptMcpServer(call);
  await server.connect(new StdioServerTransport());
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

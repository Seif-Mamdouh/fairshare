import type { Express, Request, RequestHandler, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ZodError } from "zod";
import { createReceiptMcpServer } from "./mcp-tools";

type AgentIdentity = { id: string; group_id: string; name: string };
type Dependencies = {
  challenge?: string;
  route(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler;
  authenticate(req: Request): Promise<AgentIdentity>;
  context(agent: AgentIdentity): Promise<unknown>;
  submit(agent: AgentIdentity, body: unknown): Promise<unknown>;
  drafts(agent: AgentIdentity, body: unknown): Promise<unknown>;
  finalize(agent: AgentIdentity, body: unknown): Promise<unknown>;
  status(agent: AgentIdentity, receiptId: string): Promise<unknown>;
};

export function installMcp(app: Express, d: Dependencies) {
  app.all(
    "/api/mcp",
    d.route(async (req, res) => {
      // MCP never accepts browser workspace cookies, URL credentials, or a remembered
      // transport session as authentication. Revocation is checked on every request.
      res.setHeader(
        "WWW-Authenticate",
        d.challenge || 'Bearer realm="fairshare-agent"',
      );
      if (!/^Bearer [^\s]+$/i.test(req.headers.authorization || "")) {
        return res.status(401).json({ error: "MCP authorization is required" });
      }
      const agent = await d.authenticate(req);
      res.removeHeader("WWW-Authenticate");
      if (Object.keys(req.query).length)
        return res.status(400).json({
          error:
            "Use the MCP endpoint without query parameters; pass credentials only in Authorization",
        });
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST, OPTIONS");
        return res.status(405).json({
          error:
            "This stateless MCP endpoint accepts POST; standalone SSE and session deletion are not needed",
        });
      }
      const server = createReceiptMcpServer(
        async (path, method = "GET", body) => {
          try {
            const result =
              path === "/context"
                ? await d.context(agent)
                : path === "/receipts" && method === "POST"
                  ? await d.submit(agent, body)
                  : path === "/receipts/drafts" && method === "POST"
                    ? await d.drafts(agent, body)
                    : path === "/receipts/finalize" && method === "POST"
                      ? await d.finalize(agent, body)
                      : await d.status(
                          agent,
                          decodeURIComponent(path.slice("/receipts/".length)),
                        );
            return {
              content: [{ type: "text", text: JSON.stringify(result) }],
            };
          } catch (error) {
            const e = error as Error & { status?: number };
            const status = error instanceof ZodError ? 400 : e.status || 500;
            const message =
              error instanceof ZodError
                ? error.issues
                    .map((i) => `${i.path.join(".")}: ${i.message}`)
                    .join("; ")
                : status < 500
                  ? e.message
                  : "Fairshare could not complete this request. Try again.";
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ error: message, status }),
                },
              ],
            };
          }
        },
      );
      // A new server/transport per request is safe across Vercel instances. There is
      // no process-local user/session map and no long-running notification stream.
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } finally {
        await server.close();
      }
    }),
  );
}

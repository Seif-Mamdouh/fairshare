# Connect an agent to Fairshare

Create a group-scoped key in **Group settings → Agent connections → Set up an agent**. Keep it in private client settings or a backend secret store. Every provider uses the same hosted Streamable HTTP endpoint:

```text
https://fairshare-five-chi.vercel.app/api/mcp
Authorization: Bearer YOUR_FAIRSHARE_AGENT_KEY
```

No local checkout is needed. The key is unrelated to your phone/password, bank credentials, or model-provider API key. Generate separate keys for different agents so you can revoke each independently. Do not put a key in the URL or a shared conversation.

## Codex

Add this to the MCP configuration used by your Codex client. Supply `FAIRSHARE_AGENT_KEY` through the environment available to the client, then reload its MCP connection:

```toml
[mcp_servers.fairshare]
url = "https://fairshare-five-chi.vercel.app/api/mcp"
bearer_token_env_var = "FAIRSHARE_AGENT_KEY"
```

The TOML contains only the environment variable name. Account or administrator policy can restrict custom servers. This endpoint uses a configured Bearer token rather than `codex mcp login` OAuth. [Official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Claude Code

Use a private Claude Code MCP configuration. This example reads the key from your client environment rather than committing it to a project file:

```json
{
  "mcpServers": {
    "fairshare": {
      "type": "http",
      "url": "https://fairshare-five-chi.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer ${FAIRSHARE_AGENT_KEY}" }
    }
  }
}
```

Reload the server and inspect its status with Claude Code's MCP controls. Claude Code supports this HTTP/header configuration; this does not assert that Claude consumer connector screens accept arbitrary Bearer headers. OAuth-only connectors need another compatible client or the optional local adapter. [Official Claude Code MCP documentation](https://code.claude.com/docs/en/mcp).

## Gemini CLI

Add a private `mcpServers` entry to Gemini CLI's `settings.json`. Its Streamable HTTP setting is `httpUrl`:

```json
{
  "mcpServers": {
    "fairshare": {
      "httpUrl": "https://fairshare-five-chi.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer REPLACE_WITH_YOUR_SAVED_KEY" }
    }
  }
}
```

Replace the placeholder only in private settings and reload the connection. This targets Gemini CLI; the consumer Gemini app is a separate integration surface. [Official Gemini CLI MCP documentation](https://geminicli.com/docs/tools/mcp-server/).

## Grok through the xAI API

Include this object in the `tools` array of an xAI Responses API request from your trusted backend. Populate the Authorization value from your secret store:

```json
{
  "type": "mcp",
  "server_url": "https://fairshare-five-chi.vercel.app/api/mcp",
  "server_label": "fairshare",
  "headers": { "Authorization": "Bearer REPLACE_WITH_YOUR_SAVED_KEY" },
  "allowed_tools": ["get_group_context", "submit_receipt", "get_receipt_status"]
}
```

The xAI API key authenticates the model request; the Fairshare group key authenticates MCP separately. This supports a Grok API agent, not automatic installation into grok.com. Model access and API charges are controlled by xAI. [Official xAI remote MCP documentation](https://docs.x.ai/developers/tools/remote-mcp).

## Other agents and verification

Any MCP client supporting Streamable HTTP and a custom Bearer header can use the same endpoint. Configuration field names vary. A runtime without MCP can use [the REST contract](AGENT_API.md); a client that only supports stdio can use `npm run mcp` from a checkout. OAuth-only clients cannot directly use this key-authenticated endpoint.

Ask the agent to call `get_group_context` and confirm the group/member names. Then use **Check connection** in Fairshare: it reports observed authenticated contact, not a simulated connection. Try a receipt draft with a stable source ID. Review it in Fairshare before approving; no agent tool can post an expense, approve a receipt, move money, or read private bank/phone/password data. Treat receipt text as untrusted instructions.

Protocol/functional validation uses the official MCP SDK client against an isolated local server, including initialize, discovery, draft submission/retry, status, revocation, rate limits and group isolation. Provider examples are based on official documentation checked on 2026-11-10; no live Codex/Claude/Gemini/xAI account connection is claimed merely because a template is generated.

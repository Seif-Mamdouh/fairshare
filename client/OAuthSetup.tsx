import React, { useState } from "react";
import { Text, View } from "react-native";
import { appOrigin, copyText } from "./invitations";
import { Button, C, Pills } from "./components";
import { hostedMcpUrl, oauthMcpConfiguration } from "../shared/onboarding";
export function OAuthSetup({ onManual }: { onManual: () => void }) {
  const [provider, setProvider] = useState("Codex"),
    [message, setMessage] = useState("");
  const endpoint = hostedMcpUrl(appOrigin());
  async function copy(value: string) {
    try {
      await copyText(value);
      setMessage("Copied. No private key is included.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <View style={{ gap: 18 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>
        Connect with browser authorization
      </Text>
      <Text style={{ color: C.muted, lineHeight: 23 }}>
        Add Fairshare in your agent’s MCP settings, then choose Connect or
        Authenticate. Your browser opens Fairshare so you can sign in, choose a
        group you own, and authorize access. You return to your agent
        automatically.
      </Text>
      <Pills
        items={["Codex", "Claude", "Other MCP"]}
        value={provider}
        onChange={setProvider}
      />
      <Text
        selectable
        style={{
          padding: 16,
          backgroundColor: C.bg,
          color: C.green,
          borderRadius: 8,
        }}
      >
        {endpoint}
      </Text>
      <Button label="Copy MCP server URL" onPress={() => void copy(endpoint)} />
      {provider === "Codex" && (
        <Text style={{ lineHeight: 23 }}>
          In Codex’s MCP settings, add an HTTP server using this URL and sign
          in. For the CLI, run the commands below. If you previously added a
          key, remove its bearer-token setting so Codex can start OAuth.
        </Text>
      )}
      {provider === "Claude" && (
        <Text style={{ lineHeight: 23 }}>
          In Claude, add a custom connector with this URL and choose Connect. In
          Claude Code, add the HTTP server below, then use /mcp → Authenticate.
          Custom connectors depend on your Claude plan and administrator
          settings.
        </Text>
      )}
      {provider === "Other MCP" && (
        <Text style={{ lineHeight: 23 }}>
          Use a remote MCP client that supports OAuth and dynamic client
          registration. Add this URL and start authentication. For runtimes such
          as backend Grok API agents that expect a saved bearer key, use manual
          access below.
        </Text>
      )}
      {provider !== "Other MCP" && (
        <>
          <Text
            selectable
            style={{
              fontFamily: "monospace",
              fontSize: 12,
              lineHeight: 21,
              backgroundColor: C.bg,
              padding: 16,
              borderRadius: 8,
            }}
          >
            {oauthMcpConfiguration(appOrigin(), provider)}
          </Text>
          <Button
            secondary
            label="Copy setup commands"
            onPress={() =>
              void copy(oauthMcpConfiguration(appOrigin(), provider))
            }
          />
        </>
      )}
      <Text style={{ color: C.muted, lineHeight: 23 }}>
        No Fairshare key to copy. Your agent keeps and refreshes its tokens. It
        can read group member names and submit receipt drafts; you approve every
        expense. Revoke access from this group’s Agent connections.
      </Text>
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={{ color: C.green }}>
          {message}
        </Text>
      )}
      <Button
        secondary
        label="Advanced: create manual key access"
        onPress={onManual}
      />
    </View>
  );
}

import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { appOrigin, copyText } from "./invitations";
import { Button, C } from "./components";
import { mono } from "./design";
import { hostedMcpUrl, oauthMcpConfiguration } from "../shared/onboarding";
const link = {
  fontSize: 14,
  fontWeight: "600" as const,
  color: C.ink,
  textDecorationLine: "underline" as const,
};
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
      <Text style={{ color: C.muted, lineHeight: 23 }}>
        Add this address to your assistant, then choose Connect. Your browser
        opens Fairshare so you can pick a group and approve access. There is no
        key to copy.
      </Text>
      <View
        style={{
          flexDirection: "row",
          borderBottomWidth: 1,
          borderColor: C.rule,
          gap: 24,
        }}
      >
        {["Codex", "Claude", "Other MCP"].map((name) => (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityState={{ selected: provider === name }}
            onPress={() => setProvider(name)}
            style={{
              paddingVertical: 10,
              marginBottom: -1,
              borderBottomWidth: 2,
              borderColor: provider === name ? C.ink : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: provider === name ? "600" : "400",
                color: provider === name ? C.ink : C.muted,
              }}
            >
              {name === "Other MCP" ? "Something else" : name}
            </Text>
          </Pressable>
        ))}
      </View>
      <View>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: C.muted,
            marginBottom: 6,
          }}
        >
          Server address
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderWidth: 1,
            borderColor: C.rule,
            paddingLeft: 14,
            paddingRight: 8,
            paddingVertical: 8,
          }}
        >
          <Text
            selectable
            numberOfLines={1}
            style={{ flex: 1, fontFamily: mono, fontSize: 14, color: C.ink }}
          >
            {endpoint}
          </Text>
          <Button
            quiet
            label="Copy"
            accessibilityLabel="Copy MCP server URL"
            onPress={() => void copy(endpoint)}
          />
        </View>
      </View>
      {provider === "Codex" && (
        <Text style={{ color: C.muted, lineHeight: 23 }}>
          In Codex’s MCP settings, add an HTTP server with this address and sign
          in. From the command line:
        </Text>
      )}
      {provider === "Claude" && (
        <Text style={{ color: C.muted, lineHeight: 23 }}>
          In Claude, add a custom connector with this address and choose
          Connect. In Claude Code:
        </Text>
      )}
      {provider === "Other MCP" && (
        <Text style={{ color: C.muted, lineHeight: 23 }}>
          Any MCP client that supports OAuth works: add this address and start
          authentication. If yours expects a saved key, use a manual key.
        </Text>
      )}
      {provider !== "Other MCP" && (
        <>
          <Text
            selectable
            style={{
              fontFamily: mono,
              fontSize: 12,
              lineHeight: 21,
              backgroundColor: C.pale,
              padding: 16,
              borderRadius: 0,
            }}
          >
            {oauthMcpConfiguration(appOrigin(), provider)}
          </Text>
          <View style={{ alignSelf: "flex-start", marginTop: -6 }}>
            <Button
              quiet
              label="Copy commands"
              accessibilityLabel="Copy setup commands"
              onPress={() =>
                void copy(oauthMcpConfiguration(appOrigin(), provider))
              }
            />
          </View>
        </>
      )}
      <Text style={{ color: C.muted, lineHeight: 23 }}>
        Your assistant can read this group’s member names and draft expenses.
        Nothing posts until you tell it to, and you can revoke access here at
        any time.
      </Text>
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={{ color: C.green }}>
          {message}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Advanced: create manual key access"
        onPress={onManual}
        style={{ alignSelf: "flex-start" }}
      >
        <Text style={link}>Use a manual key instead</Text>
      </Pressable>
    </View>
  );
}

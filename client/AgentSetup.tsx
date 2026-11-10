import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, Linking } from "react-native";
import { C, Button, Field, Pills, Tag } from "./components";
import { appOrigin, copyText } from "./invitations";
import {
  agentConnectionLabel,
  agentInstructions,
  mcpConfiguration,
  hostedMcpUrl,
  remoteMcpConfiguration,
  mcpProviders,
  mcpProviderGuides,
  type McpProvider,
} from "../shared/onboarding";
type Agent = {
  id: string;
  name: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
};
export function AgentSetup({
  agent,
  privateKey,
  onCheck,
  onClose,
}: {
  agent: Agent;
  privateKey: string;
  onCheck: () => Promise<Agent>;
  onClose: () => void;
}) {
  const [method, setMethod] = useState("Hosted MCP"),
    [folder, setFolder] = useState(""),
    [showKey, setShowKey] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(false),
    [status, setStatus] = useState(agent);
  const [provider, setProvider] = useState<McpProvider>("Codex");
  const origin = appOrigin();
  async function copy(value: string, label: string) {
    setError("");
    try {
      await copyText(value);
      setMessage(label);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function check() {
    setChecking(true);
    setError("");
    try {
      const current = await onCheck();
      setStatus(current);
      setMessage(
        current.last_used_at
          ? "Your agent successfully contacted Fairshare. You can ask it to submit a receipt."
          : "Still waiting. Finish setup in your agent, then ask it to read the group context.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }
  const setup = agentInstructions(origin);
  return (
    <View style={{ gap: 18 }}>
      <Tag text={agentConnectionLabel(status).toUpperCase()} />
      <Text style={styles.heading}>
        {privateKey
          ? "Access created. Now connect your agent."
          : `Set up ${agent.name}`}
      </Text>
      <Text style={styles.body}>
        This access is for this group only. Your agent can read member names and
        send receipt drafts. You approve each draft before it changes balances.
      </Text>
      {privateKey ? (
        <View style={styles.box}>
          <Text style={styles.title}>1. Save your private access key</Text>
          <Text style={styles.body}>
            Copy it into your agent’s secret settings. Do not send it as a
            people invite or paste it into a public conversation. It cannot be
            retrieved after closing this screen.
          </Text>
          <TextInput
            accessibilityLabel="Private agent key"
            editable={false}
            secureTextEntry={!showKey}
            value={privateKey}
            style={styles.code}
          />
          <View style={styles.row}>
            <Button
              secondary
              small
              label="Copy private key"
              onPress={() => void copy(privateKey, "Private key copied")}
            />
            <Button
              secondary
              small
              label={showKey ? "Hide key" : "Show key"}
              onPress={() => setShowKey(!showKey)}
            />
          </View>
        </View>
      ) : (
        <Text style={styles.body}>
          Use the key you saved when this access was created. Lost it? Close
          this screen, revoke this access, and add the agent again to get a new
          key.
        </Text>
      )}
      <Text style={styles.title}>2. Choose your connection method</Text>
      <Pills
        items={["Hosted MCP", "Local MCP", "HTTP / custom agent"]}
        value={method}
        onChange={setMethod}
      />
      {method === "Hosted MCP" ? (
        <View style={styles.box}>
          <Text style={styles.title}>Connect directly to Fairshare</Text>
          <Text style={styles.body}>
            No source checkout or local server is required. Choose the client or
            API you use.
          </Text>
          <Pills
            items={[...mcpProviders]}
            value={provider}
            onChange={setProvider}
          />
          <Text style={styles.body}>{mcpProviderGuides[provider].text}</Text>
          <Text selectable style={styles.code}>
            {hostedMcpUrl(origin)}
          </Text>
          <Button
            secondary
            small
            label="Copy MCP endpoint"
            onPress={() =>
              void copy(
                hostedMcpUrl(origin),
                "Endpoint copied — no key is included",
              )
            }
          />
          <Button
            label={
              provider === "Codex"
                ? "Copy Codex configuration"
                : privateKey
                  ? "Copy private provider configuration"
                  : "Copy provider configuration template"
            }
            onPress={() => {
              try {
                void copy(
                  remoteMcpConfiguration(
                    origin,
                    provider,
                    privateKey || "REPLACE_WITH_YOUR_SAVED_KEY",
                  ),
                  provider === "Codex"
                    ? "Configuration copied — set FAIRSHARE_AGENT_KEY in your Codex environment"
                    : privateKey
                      ? "Private configuration copied — keep it in trusted settings"
                      : "Template copied — replace the placeholder with your saved key",
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
          <Text style={styles.body}>
            {provider === "Codex"
              ? "Your key is read from FAIRSHARE_AGENT_KEY, not embedded in the copied configuration."
              : "The copied configuration includes your key when available. Use only private client settings or backend secrets; never paste it into a shared conversation."}
          </Text>
          <Button
            secondary
            small
            label="Open official provider setup guide"
            onPress={() =>
              void Linking.openURL(mcpProviderGuides[provider].url)
            }
          />
        </View>
      ) : method === "Local MCP" ? (
        <View style={styles.box}>
          <Text style={styles.title}>
            Add a local MCP server to your agent app
          </Text>
          <Text style={styles.body}>
            Your client must support local MCP servers. This is manual setup,
            for clients that require a local process.
          </Text>
          <Text style={styles.body}>
            Download the Fairshare source, install Node.js 22 or newer, and run
            npm ci in its folder. Enter that folder’s full path below, then copy
            the configuration into your client’s MCP server settings and restart
            the connection.
          </Text>
          <Button
            secondary
            small
            label="Open Fairshare source"
            onPress={() =>
              void Linking.openURL("https://github.com/Seif-Mamdouh/fairshare")
            }
          />
          <Text style={styles.body}>
            The repository is private; your GitHub account needs access. For
            remote MCP clients, choose Hosted MCP above.
          </Text>
          <Field
            label="Fairshare project folder"
            value={folder}
            onChangeText={setFolder}
            autoCapitalize="none"
            placeholder="/Users/you/fairshare"
          />
          <Button
            label={
              privateKey
                ? "Copy private MCP configuration"
                : "Copy MCP configuration template"
            }
            disabled={!folder.trim()}
            onPress={() => {
              try {
                void copy(
                  mcpConfiguration(
                    origin,
                    folder,
                    privateKey || "REPLACE_WITH_YOUR_SAVED_KEY",
                  ),
                  privateKey
                    ? "Private MCP configuration copied"
                    : "Template copied — replace the key placeholder locally",
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
          <Text style={styles.body}>
            {privateKey
              ? "The copied configuration contains your key. Paste it only into trusted client settings."
              : "The template has a key placeholder. Replace it with your saved key in your client’s settings."}
          </Text>
        </View>
      ) : (
        <View style={styles.box}>
          <Text style={styles.title}>
            Use an agent that can make HTTPS requests
          </Text>
          <Text style={styles.body}>
            Store the key as FAIRSHARE_AGENT_KEY in your agent runtime’s
            secrets, then give it these setup instructions. Consumer chat apps
            may require a separate tool-enabled runtime.
          </Text>
          <Button
            label="Copy agent setup instructions"
            onPress={() =>
              void copy(
                setup,
                "Setup instructions copied — these do not contain your key",
              )
            }
          />
          <Text selectable style={styles.body}>
            {setup}
          </Text>
        </View>
      )}
      <View style={styles.box}>
        <Text style={styles.title}>3. Verify the connection</Text>
        <Text style={styles.body}>
          Ask your agent: “Read my Fairshare group and tell me its member
          names.” Then check below. This checks for an actual authenticated
          request from your agent; it doesn’t connect on the agent’s behalf.
        </Text>
        <Button
          label={checking ? "Checking…" : "Check connection"}
          disabled={checking}
          onPress={() => void check()}
        />
        {status.last_used_at && (
          <Text style={styles.body}>
            Last contact: {new Date(status.last_used_at).toLocaleString()}
          </Text>
        )}
      </View>
      <Button
        secondary
        small
        label={
          advanced
            ? "Hide advanced setup"
            : "Advanced: REST example & API schema"
        }
        onPress={() => setAdvanced(!advanced)}
      />
      {advanced && (
        <View style={styles.box}>
          <Text
            selectable
            style={styles.code}
          >{`curl '${origin}/api/v1/agent/context' \\\n  -H "Authorization: Bearer $FAIRSHARE_AGENT_KEY"`}</Text>
          <Button
            secondary
            small
            label="Copy REST connection check"
            onPress={() =>
              void copy(
                `curl '${origin}/api/v1/agent/context' -H "Authorization: Bearer $FAIRSHARE_AGENT_KEY"`,
                "REST example copied",
              )
            }
          />
          <Button
            secondary
            small
            label="Open API schema"
            onPress={() => void Linking.openURL(origin + "/openapi.json")}
          />
        </View>
      )}
      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: C.green, lineHeight: 21 }}
        >
          {message}
        </Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: C.red }}>
          {error}
        </Text>
      )}
      <Button secondary label="Done" onPress={onClose} />
    </View>
  );
}
const styles = StyleSheet.create({
  heading: { fontSize: 21, fontWeight: "600", color: C.ink },
  title: { fontSize: 15, fontWeight: "600", color: C.ink },
  body: { fontSize: 13, lineHeight: 22, color: C.muted },
  box: { padding: 16, backgroundColor: C.bg, borderRadius: 12, gap: 12 },
  row: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  code: {
    fontFamily: "monospace",
    fontSize: 12,
    color: C.green,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    padding: 12,
    lineHeight: 19,
  },
});

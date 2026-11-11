import { serif } from "./design";
import React, { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View, Pressable } from "react-native";
import { api } from "./api";
import { Button, C, Card, Tag } from "./components";
export function OAuthConsent({
  requestId,
  user,
  onSignOut,
}: {
  requestId: string;
  user: { name: string };
  onSignOut: () => Promise<void>;
}) {
  const [details, setDetails] = useState<any>(null),
    [group, setGroup] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    let active = true;
    setDetails(null);
    setError("");
    setGroup("");
    api("/oauth/consent/" + encodeURIComponent(requestId))
      .then((data) => {
        if (active) setDetails(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [requestId]);
  async function decide(approve: boolean) {
    if (submitting.current || !details) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api(
        "/oauth/consent/" + encodeURIComponent(requestId),
        "POST",
        {
          nonce: details.nonce,
          approve,
          ...(approve ? { groupId: group } : {}),
        },
      );
      window.location.assign(result.redirectUrl);
    } catch (e) {
      setError((e as Error).message);
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Card
        style={{ width: "100%", maxWidth: 560, alignSelf: "center", gap: 18 }}
      >
        <Tag text="FAIRSHARE AUTHORIZATION" />
        <Text
          style={{
            fontFamily: serif,
            fontSize: 32,
            fontWeight: "400",
            color: C.ink,
          }}
        >
          Connect your agent
        </Text>
        <Text style={{ color: C.muted }}>Signed in as {user.name}</Text>
        {!details && !error && <Text>Loading authorization request…</Text>}
        {details && (
          <>
            <Text style={{ fontSize: 18, fontWeight: "600" }}>
              {details.clientName} wants access to one group
            </Text>
            <Text style={{ color: C.muted, lineHeight: 22 }}>
              Only approve if you started this connection in your agent. The app
              supplies its own name; Fairshare has not verified its publisher.
            </Text>
            <View
              style={{
                padding: 14,
                backgroundColor: C.bg,
                borderRadius: 10,
                gap: 8,
              }}
            >
              <Text style={{ fontWeight: "600" }}>Return to this address</Text>
              <Text selectable style={{ color: C.muted, lineHeight: 21 }}>
                {details.redirectUri}
              </Text>
            </View>
            <Text style={{ lineHeight: 23 }}>
              Allow this agent to read the group’s name, currency and member
              names, submit and read its own receipt drafts, and post those
              drafts as expenses when you ask. It can also edit or reject its
              drafts and edit or void the expenses it posted. Posting, editing
              and voiding expenses changes balances. It cannot read bank
              transactions, phone numbers or passwords, or move money.
            </Text>
            <Text style={{ color: C.muted, lineHeight: 22 }}>
              Access lasts up to 30 days, with automatic token refresh. Revoke
              it anytime in Group settings → Agent connections.
            </Text>
            <Text style={{ fontWeight: "600" }}>Choose a group you own</Text>
            {details.groups.map((g: any) => (
              <Pressable
                key={g.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: group === g.id }}
                accessibilityLabel={g.name}
                disabled={busy}
                onPress={() => setGroup(g.id)}
                style={{
                  padding: 15,
                  borderWidth: 1,
                  borderColor: group === g.id ? C.green : C.line,
                  borderRadius: 10,
                  backgroundColor: group === g.id ? C.bg : "white",
                }}
              >
                <Text style={{ color: C.ink, fontWeight: "600" }}>
                  {group === g.id ? "● " : "○ "}
                  {g.name} · {g.currency}
                </Text>
              </Pressable>
            ))}
            {!details.groups.length && (
              <Text style={{ color: C.muted, lineHeight: 22 }}>
                You don’t own a group yet. Cancel, create a group in Fairshare,
                then start the connection again from your agent.
              </Text>
            )}
            <Button
              label={
                busy ? "Returning to your agent…" : "Authorize selected group"
              }
              disabled={busy || !group}
              onPress={() => void decide(true)}
            />
            <Button
              secondary
              label="Cancel authorization"
              disabled={busy}
              onPress={() => void decide(false)}
            />
          </>
        )}
        {!!error && (
          <Text
            accessibilityRole="alert"
            style={{ color: C.red, lineHeight: 22 }}
          >
            {error}
          </Text>
        )}
        <Button
          secondary
          label="Use another account"
          disabled={busy}
          onPress={() =>
            void onSignOut().then(() => {
              if (details) window.location.assign(details.restartUrl);
            })
          }
        />
        <Button
          secondary
          label="Return to Fairshare"
          disabled={busy}
          onPress={() => window.location.assign("/")}
        />
      </Card>
    </ScrollView>
  );
}

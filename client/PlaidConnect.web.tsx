import React, { useEffect, useRef, useState } from "react";
import { View, Text } from "react-native";
import { usePlaidLink } from "react-plaid-link";
import { Button, C } from "./components";
const storageKey = "fairshare_bank_link";
type Session = { id: string; linkToken: string };
export function PlaidConnect({ disabled, start, complete }: any) {
  const [session, setSession] = useState<Session | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  });
  const [pending, setPending] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const opened = useRef("");
  function clear() {
    sessionStorage.removeItem(storageKey);
    setSession(null);
    opened.current = "";
    if (window.location.search.includes("oauth_state_id"))
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.hash,
      );
  }
  async function finish(token: string, current: Session) {
    setPending(token);
    setBusy(true);
    setError("");
    try {
      await complete(token, current.id);
      setPending(null);
      clear();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const {
    open,
    ready,
    error: linkError,
  } = usePlaidLink({
    token: session?.linkToken || null,
    ...(window.location.search.includes("oauth_state_id")
      ? { receivedRedirectUri: window.location.href }
      : {}),
    onSuccess: (publicToken) => {
      if (session && publicToken) void finish(publicToken, session);
    },
    onExit: (e) => {
      if (e) setError("Bank linking was not completed. Please try again.");
      clear();
      setBusy(false);
    },
  });
  useEffect(() => {
    if (ready && session && !pending && opened.current !== session.id) {
      opened.current = session.id;
      open();
    }
  }, [ready, session, pending, open]);
  async function begin() {
    setBusy(true);
    setError("");
    try {
      const s = await start("web");
      sessionStorage.setItem(storageKey, JSON.stringify(s));
      setSession(s);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      {!!(error || linkError) && (
        <Text accessibilityRole="alert" style={{ color: C.red }}>
          {error || "Plaid Link could not load. Check your connection."}
        </Text>
      )}
      {pending && session ? (
        <Button
          label={busy ? "Finishing…" : "Retry connection completion"}
          disabled={busy}
          onPress={() => void finish(pending, session)}
        />
      ) : (
        <Button
          label={busy ? "Opening Plaid…" : "Connect a US bank"}
          disabled={disabled || busy}
          onPress={() => void begin()}
        />
      )}
      {(session || busy) && !pending && (
        <Button
          secondary
          label="Cancel bank connection"
          onPress={() => {
            clear();
            setBusy(false);
          }}
        />
      )}
    </View>
  );
}

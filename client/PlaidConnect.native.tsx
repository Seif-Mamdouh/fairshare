import React, { useState } from "react";
import { View, Text, Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Button, C } from "./components";
export function PlaidConnect({ disabled, start, complete }: any) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState<{ token: string; id: string } | null>(
      null,
    );
  const expoGo =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  async function finish(value: { token: string; id: string }) {
    setPending(value);
    setBusy(true);
    try {
      await complete(value.token, value.id);
      setPending(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function begin() {
    setBusy(true);
    setError("");
    try {
      // Loading lazily lets the rest of Fairshare continue to work inside Expo Go.
      const { createPlaidLinkSession } =
        await import("react-native-plaid-link-sdk");
      const s = await start(Platform.OS);
      const link = await createPlaidLinkSession({
        token: s.linkToken,
        onSuccess: (result) => {
          void finish({ token: result.publicToken, id: s.id });
        },
        onExit: () => {
          setBusy(false);
        },
        onEvent: () => {},
      });
      await link.open();
    } catch {
      setError(
        "Bank linking needs a rebuilt native app with Plaid configured. You can also use Fairshare on the web.",
      );
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      {expoGo && (
        <Text style={{ color: C.muted }}>
          Bank linking is available on the web or in a Fairshare
          development/production build. Expo Go cannot run Plaid Link.
        </Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: C.red }}>
          {error}
        </Text>
      )}
      {pending ? (
        <Button
          label="Retry connection completion"
          disabled={busy}
          onPress={() => void finish(pending)}
        />
      ) : (
        <Button
          label={busy ? "Opening Plaid…" : "Connect a US bank"}
          disabled={disabled || busy || expoGo}
          onPress={() => void begin()}
        />
      )}
    </View>
  );
}

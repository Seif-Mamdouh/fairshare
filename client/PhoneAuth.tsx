import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Button, Field, C } from "./components";
import { api } from "./api";
export function PhoneAuth({
  link = false,
  available,
  onComplete,
}: {
  link?: boolean;
  available: boolean;
  onComplete: (data: any) => Promise<void>;
}) {
  const [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [name, setName] = useState("");
  const [challenge, setChallenge] = useState(""),
    [retryAt, setRetryAt] = useState(0),
    [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  async function start() {
    setBusy(true);
    setError("");
    try {
      const result = await api("/auth/phone/start", "POST", {
        phone,
        purpose: link ? "link" : "login",
      });
      setChallenge(result.challenge);
      setCode("");
      setRetryAt(Date.now() + result.resendAfter * 1000);
      setNow(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setBusy(true);
    setError("");
    try {
      const result = await api("/auth/phone/check", "POST", {
        challenge,
        code,
        ...(!link && name.trim() ? { name: name.trim() } : {}),
      });
      setCode("");
      setChallenge("");
      await onComplete(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!available)
    return (
      <Text style={styles.body}>
        Phone sign-in is not available yet. You can sign in with email while
        text-message verification is being set up.
      </Text>
    );
  return (
    <View style={{ gap: 14 }}>
      <Text style={styles.body}>
        {link
          ? "Verify a phone number to sign in to this same account. Your groups and email login stay with you."
          : "Enter your number to sign in or create an account. We’ll verify it with a text-message code, then keep you signed in on this device for 30 days unless you sign out."}
      </Text>
      {!challenge ? (
        <>
          <Field
            label="Phone number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="+ country code and phone number"
          />
          <Text style={styles.body}>
            Include + and your country code. By requesting a code, you agree to
            receive a verification text. Message and data rates may apply.
          </Text>
          <Button
            label={busy ? "Requesting code…" : "Text me a code"}
            onPress={() => void start()}
            disabled={busy || !phone.trim()}
          />
        </>
      ) : (
        <>
          <Text style={styles.body}>
            Enter the code from your text message. It expires in 10 minutes.
            Never share it with anyone.
          </Text>
          <Field
            label="Verification code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            maxLength={10}
          />
          {!link && (
            <Field
              label="Your name (for a new account)"
              value={name}
              onChangeText={setName}
              autoComplete="name"
              placeholder="Existing account names stay unchanged"
            />
          )}
          <Button
            label={
              busy
                ? "Verifying…"
                : link
                  ? "Verify and link phone"
                  : "Verify and continue"
            }
            onPress={() => void verify()}
            disabled={busy || !/^\d{4,10}$/.test(code)}
          />
          <Button
            secondary
            label={seconds ? `Resend code in ${seconds}s` : "Resend code"}
            onPress={() => void start()}
            disabled={busy || seconds > 0}
          />
          <Button
            secondary
            label="Use a different number"
            disabled={busy}
            onPress={() => {
              setChallenge("");
              setCode("");
              setError("");
            }}
          />
        </>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  body: { color: C.muted, lineHeight: 22 },
  error: { color: "#B3382C", lineHeight: 22 },
});

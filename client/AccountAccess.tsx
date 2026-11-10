import React, { useState, useRef } from "react";
import { Text, View } from "react-native";
import { api } from "./api";
import { Button, C, Field } from "./components";
export function AccountAccess({ user, onSession, onSignOut }: any) {
  const manage = !!user.sign_in_enabled;
  const [mode, setMode] = useState(user.phone_e164 ? "setup" : "login");
  const [phone, setPhone] = useState(user.phone_e164 || ""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [current, setCurrent] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const pending = useRef(false);
  const login = !manage && mode === "login";
  async function submit() {
    if (pending.current) return;
    setError("");
    setNotice("");
    if (!login && password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    if (!login && password.length < 12) {
      setError("Use at least 12 characters for your password.");
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const result = await api(
        manage ? "/me/password" : login ? "/auth/login" : "/auth/register",
        "POST",
        manage ? { currentPassword: current, password } : { phone, password },
      );
      await onSession(result);
      setPassword("");
      setConfirm("");
      setCurrent("");
      setNotice(
        manage ? "Password changed. Other devices have been signed out." : "",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 14 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>
        {manage
          ? "Account sign-in"
          : login
            ? "Welcome back"
            : user.phone_e164
              ? "Sign in from any device"
              : "Create your account"}
      </Text>
      <Text style={{ color: C.muted, lineHeight: 22 }}>
        {manage
          ? "Use your phone number and password to open this same account on any device."
          : login
            ? "Sign in with your phone number and password to access your groups and expenses."
            : user.phone_e164
              ? "Set a password for your existing account. Your groups, expenses and bank connections stay with you."
              : "Choose a password so you can return to the same account from any device. No text-message code is needed."}
      </Text>
      {!manage && (
        <Field
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          placeholder="(202) 555-0123"
          keyboardType="phone-pad"
          autoComplete="tel"
          maxLength={80}
          editable={!busy}
        />
      )}
      {!manage && (
        <Text style={{ color: C.muted }}>
          Outside the US, include + and your country code.
        </Text>
      )}
      {manage && (
        <Field
          label="Current password"
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          autoCapitalize="none"
          editable={!busy}
        />
      )}
      <Field
        label={manage ? "New password" : "Password"}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete={login ? "current-password" : "new-password"}
        textContentType={login ? "password" : "newPassword"}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={128}
        editable={!busy}
      />
      {!login && (
        <>
          <Text style={{ color: C.muted }}>
            Use at least 12 characters. A memorable phrase works well.
          </Text>
          <Field
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={128}
            editable={!busy}
          />
        </>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: C.red }}>
          {error}
        </Text>
      )}
      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={{ color: C.green }}>
          {notice}
        </Text>
      )}
      <Button
        label={
          busy
            ? "Please wait…"
            : manage
              ? "Change password"
              : login
                ? "Sign in"
                : user.phone_e164
                  ? "Set password"
                  : "Create account"
        }
        disabled={busy || !password || (!manage && !phone.trim())}
        onPress={() => void submit()}
      />
      {!manage && (
        <Button
          secondary
          label={
            login
              ? user.phone_e164
                ? "Set a password for this account"
                : "Create a new account"
              : "Already have an account? Sign in"
          }
          disabled={busy}
          onPress={() => {
            setMode(login ? "setup" : "login");
            setPassword("");
            setConfirm("");
            setError("");
          }}
        />
      )}
      {login && (
        <Text style={{ color: C.muted, lineHeight: 21 }}>
          Already used Fairshare before passwords? Open it on the device with
          your account and set a password there first. There is no SMS password
          reset.
        </Text>
      )}
      {manage && onSignOut && (
        <Button
          secondary
          label="Sign out on this device"
          disabled={busy}
          onPress={() => void onSignOut()}
        />
      )}
    </View>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { api } from "./api";
import { Button, C, Field } from "./components";

type Props = {
  value?: string | null;
  requiresPassword?: boolean;
  onSaved: (user: { id: string; name: string; phone_e164: string }) => void;
};

export function PhoneEntry({ value, requiresPassword, onSaved }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [phone, setPhone] = useState(value || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const submitting = useRef(false);
  useEffect(() => setPhone(value || ""), [value]);
  async function save() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const user = await api("/me/phone", "POST", {
        phone,
        ...(requiresPassword ? { currentPassword } : {}),
      });
      setPhone(user.phone_e164);
      setSaved(true);
      setCurrentPassword("");
      onSaved(user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <Field
        label="Phone number"
        value={phone}
        onChangeText={(text: string) => {
          setPhone(text);
          setSaved(false);
        }}
        placeholder="(202) 555-0123"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        autoCorrect={false}
        maxLength={80}
        editable={!busy}
        onSubmitEditing={() => void save()}
      />
      <Text style={{ color: C.muted, lineHeight: 21 }}>
        US numbers can use 10 digits. For other countries, include + and the
        country code.
      </Text>
      {requiresPassword && (
        <Field
          label="Password to change phone number"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoComplete="current-password"
          autoCapitalize="none"
          maxLength={128}
          editable={!busy}
        />
      )}
      <Text style={{ color: C.muted, lineHeight: 21 }}>
        Your phone number is your sign-in name. It stays private; no
        verification text is sent.
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: C.red }}>
          {error}
        </Text>
      )}
      {saved && (
        <Text accessibilityLiveRegion="polite" style={{ color: C.green }}>
          Phone number saved
        </Text>
      )}
      <Button
        label={busy ? "Saving…" : value ? "Save phone number" : "Continue"}
        disabled={busy || !phone.trim()}
        onPress={() => void save()}
      />
    </View>
  );
}

/**
 * Everything that imports the Clerk SDK lives in this file. It is loaded lazily
 * by `client/clerk.tsx`, and only when a publishable key is configured, so an
 * app without Clerk never evaluates the SDK or its polyfills.
 */
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import {
  ClerkProvider,
  getClerkInstance,
  useAuth,
  useClerk,
  useSignIn,
  useSignUp,
  useUser,
} from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { api } from "./api";
import { Button, C, Field } from "./components";
import { serif } from "./design";

/** Wraps the app once. `tokenCache` is SecureStore on native and unused on web. */
export function ClerkRoot({
  publishableKey,
  children,
}: {
  publishableKey: string;
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      {children}
    </ClerkProvider>
  );
}

/** Ends the Clerk session on this device. The Fairshare session is cleared separately. */
export async function signOutOfClerk(publishableKey: string) {
  const clerk = getClerkInstance({ publishableKey, tokenCache });
  await clerk?.signOut();
}

const messageOf = (error: unknown) => {
  const e = error as {
    errors?: { longMessage?: string; message?: string }[];
    longMessage?: string;
    message?: string;
  };
  return (
    e?.errors?.[0]?.longMessage ||
    e?.errors?.[0]?.message ||
    e?.longMessage ||
    e?.message ||
    "Something went wrong. Please try again."
  );
};
/** Clerk's sign-in and sign-up methods resolve to `{ error }` instead of throwing. */
async function must(step: Promise<{ error: unknown }>) {
  const { error } = await step;
  if (error) throw error;
}

type Props = {
  onSession: (result: any) => Promise<void>;
  onUsePhone: () => void;
};

/**
 * Email sign-in and sign-up with Clerk, then an exchange of the Clerk session
 * token for the normal Fairshare session at POST /api/auth/clerk.
 */
export function ClerkAccess({ onSession, onUsePhone }: Props) {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const { user: clerkUser } = useUser();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [step, setStep] = useState<"form" | "code">("form");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const pending = useRef(false);
  const creating = mode === "sign-up";
  // Clerk loads over the network; say so instead of spinning forever.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  /** Trades the active Clerk session for a Fairshare session. */
  async function exchange() {
    const token = await clerk.session?.getToken();
    if (!token)
      throw new Error("Your sign-in did not finish. Please try again.");
    const name = clerk.user?.fullName?.trim().slice(0, 80);
    const result = await api("/auth/clerk", "POST", {
      token,
      ...(name ? { name } : {}),
    });
    setPassword("");
    setCode("");
    setStep("form");
    await onSession(result);
  }
  // The Clerk application requires fields this form does not collect (for example a
  // username or phone number). Name them so the owner can make them optional in Clerk.
  const needsMore = (attempt: { missingFields: string[] }) =>
    `Sign-up also requires: ${attempt.missingFields
      .map((field) => field.replace(/_/g, " "))
      .join(", ")}. Fairshare only collects email and password.`;
  const submit = () =>
    run(async () => {
      const emailAddress = email.trim();
      if (creating) {
        if (password.length < 8)
          throw new Error("Use at least 8 characters for your password.");
        await must(signUp.password({ emailAddress, password }));
        if (signUp.status !== "complete") {
          if (signUp.missingFields.length) throw new Error(needsMore(signUp));
          if (!signUp.unverifiedFields.includes("email_address"))
            throw new Error(
              "This sign-up needs details Fairshare does not collect yet.",
            );
          await must(signUp.verifications.sendEmailCode());
          setStep("code");
          setNotice("We emailed you a verification code.");
          return;
        }
        await must(signUp.finalize());
      } else {
        await must(signIn.password({ emailAddress, password }));
        if (signIn.status !== "complete") {
          // A new device, or an account with an email second factor.
          const emailCode =
            (signIn.status === "needs_client_trust" ||
              signIn.status === "needs_second_factor") &&
            signIn.supportedSecondFactors.some(
              (factor) => factor.strategy === "email_code",
            );
          if (!emailCode)
            throw new Error(
              "This account needs a sign-in step Fairshare does not support yet.",
            );
          await must(signIn.mfa.sendEmailCode());
          setStep("code");
          setNotice("We emailed you a verification code.");
          return;
        }
        await must(signIn.finalize());
      }
      await exchange();
    });
  const verify = () =>
    run(async () => {
      const attempt = creating ? signUp : signIn;
      await must(
        creating
          ? signUp.verifications.verifyEmailCode({ code: code.trim() })
          : signIn.mfa.verifyEmailCode({ code: code.trim() }),
      );
      if (attempt.status !== "complete")
        throw new Error(
          creating && signUp.missingFields.length
            ? needsMore(signUp)
            : "Verification is not complete yet. Check the code and try again.",
        );
      await must(attempt.finalize());
      await exchange();
    });
  const resend = () =>
    run(async () => {
      await must(
        creating
          ? signUp.verifications.sendEmailCode()
          : signIn.mfa.sendEmailCode(),
      );
      setNotice("A new code is on its way.");
    });
  const startOver = () => {
    setStep("form");
    setCode("");
    setError("");
    setNotice("");
  };

  const signedInAs =
    clerkUser?.primaryEmailAddress?.emailAddress || "your account";
  const title = !isLoaded
    ? "Sign in"
    : isSignedIn
      ? "Welcome back"
      : step === "code"
        ? "Check your email"
        : creating
          ? "Create your account"
          : "Welcome back";
  const intro = !isLoaded
    ? slow
      ? "Email sign-in is not available right now. Check your connection and reload, or use your phone number and password."
      : "Getting sign-in ready…"
    : isSignedIn
      ? `You’re signed in as ${signedInAs}. Continue to open your groups and expenses.`
      : step === "code"
        ? `Enter the code we sent to ${email.trim()}.`
        : creating
          ? "Use your email to return to the same account from any device. Groups already on this device stay with you."
          : "Sign in with your email to access your groups and expenses.";
  return (
    <View style={{ gap: 14 }}>
      <Text
        accessibilityRole="header"
        style={{
          fontFamily: serif,
          color: C.ink,
          fontSize: 32,
          fontWeight: "400",
          letterSpacing: -0.8,
        }}
      >
        {title}
      </Text>
      <Text style={{ color: C.muted, lineHeight: 22 }}>{intro}</Text>
      {!isLoaded ? (
        !slow && <ActivityIndicator color={C.green} />
      ) : isSignedIn ? (
        <>
          <Button
            label={busy ? "Please wait…" : "Continue"}
            disabled={busy}
            onPress={() => void run(exchange)}
          />
          <Button
            secondary
            label="Use a different email"
            disabled={busy}
            onPress={() => void run(() => clerk.signOut())}
          />
        </>
      ) : step === "code" ? (
        <>
          <Field
            label="Verification code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={12}
            editable={!busy}
            onSubmitEditing={() => void verify()}
          />
          <Button
            label={busy ? "Please wait…" : "Verify and continue"}
            disabled={busy || !code.trim()}
            onPress={() => void verify()}
          />
          <Button
            secondary
            label="Send a new code"
            disabled={busy}
            onPress={() => void resend()}
          />
          <Button
            secondary
            label="Start over"
            disabled={busy}
            onPress={startOver}
          />
        </>
      ) : (
        <>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={254}
            editable={!busy}
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={creating ? "new-password" : "current-password"}
            textContentType={creating ? "newPassword" : "password"}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={128}
            editable={!busy}
            onSubmitEditing={() => void submit()}
          />
          {/* Clerk mounts its bot-protection widget here on web sign-ups. */}
          {creating && Platform.OS === "web" && (
            <View nativeID="clerk-captcha" />
          )}
          <Button
            label={
              busy ? "Please wait…" : creating ? "Create account" : "Sign in"
            }
            disabled={busy || !email.trim() || !password}
            onPress={() => void submit()}
          />
          <Button
            secondary
            label={
              creating
                ? "Already have an account? Sign in"
                : "Create a new account"
            }
            disabled={busy}
            onPress={() => {
              setMode(creating ? "sign-in" : "sign-up");
              setPassword("");
              setError("");
              setNotice("");
            }}
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
        secondary
        label="Use phone number and password instead"
        disabled={busy}
        onPress={onUsePhone}
      />
    </View>
  );
}

/**
 * Optional Clerk sign-in. This file never imports the Clerk SDK directly: with
 * EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY unset every export is a pass-through and
 * `client/ClerkAuth.tsx` is never loaded. See docs/CLERK_AUTH.md.
 */
import React, { Suspense, lazy, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { AccountAccess } from "./AccountAccess";
import { Button, C } from "./components";

const publishableKey = (
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || ""
).trim();
/** A malformed key is ignored rather than allowed to crash the app at startup. */
export const clerkEnabled = /^pk_(test|live)_\S+$/.test(publishableKey);
if (publishableKey && !clerkEnabled)
  console.warn(
    "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not a Clerk publishable key; Clerk sign-in is off.",
  );

const load = () => import("./ClerkAuth");
const Root = lazy(() => load().then((m) => ({ default: m.ClerkRoot })));
const Access = lazy(() => load().then((m) => ({ default: m.ClerkAccess })));
const waiting = (
  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
    <ActivityIndicator color={C.green} />
  </View>
);

/** Provides Clerk to the whole app when it is configured. */
export function ClerkGate({ children }: { children: React.ReactNode }) {
  if (!clerkEnabled) return <>{children}</>;
  return (
    <Suspense fallback={waiting}>
      <Root publishableKey={publishableKey}>{children}</Root>
    </Suspense>
  );
}

/** Clears the Clerk session; a no-op without Clerk. Never blocks Fairshare sign-out. */
export async function clerkSignOut() {
  if (!clerkEnabled) return;
  try {
    await (await load()).signOutOfClerk(publishableKey);
  } catch {}
}

/** The sign-in surface: email through Clerk when configured, phone and password otherwise. */
export function SignInPanel({ user, onSession }: any) {
  const [phone, setPhone] = useState(false);
  if (!clerkEnabled) return <AccountAccess user={user} onSession={onSession} />;
  if (phone)
    return (
      <View style={{ gap: 14 }}>
        <AccountAccess user={user} onSession={onSession} />
        <Button
          secondary
          label="Use email instead"
          onPress={() => setPhone(false)}
        />
      </View>
    );
  return (
    <Suspense fallback={<ActivityIndicator color={C.green} />}>
      <Access onSession={onSession} onUsePhone={() => setPhone(true)} />
    </Suspense>
  );
}

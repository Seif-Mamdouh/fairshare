/**
 * Web build of the Clerk sign-in surface: Clerk's own prebuilt <SignIn /> and
 * <SignUp /> cards. Metro picks this file over `ClerkAuth.tsx` on web, so the
 * native bundle never sees the web-only components. Like its native sibling it
 * is loaded lazily by `client/clerk.tsx`, and only when a key is configured.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { ClerkProvider, useAuth, useClerk, useUser } from "@clerk/expo";
import { SignIn, SignUp } from "@clerk/expo/web";
import { tokenCache } from "@clerk/expo/token-cache";
import { api } from "./api";
import { Button, C } from "./components";
import { display, palette, sans } from "./design";

/**
 * The app has no router, so the cards use hash routing for their own steps
 * (`#/factor-one`, `#/sso-callback`, …) and one query parameter says which
 * card is showing. Clerk navigates between the two through the functions
 * below, which keeps the switch on the page instead of reloading it.
 */
const param = "auth";
type Mode = "sign-in" | "sign-up";
const readMode = (): Mode =>
  new URLSearchParams(window.location.search).get(param) === "sign-up"
    ? "sign-up"
    : "sign-in";
/** The current page as the address of one of the cards, without a card step. */
function cardUrl(mode: Mode) {
  const url = new URL(window.location.href);
  if (mode === "sign-up") url.searchParams.set(param, "sign-up");
  else url.searchParams.delete(param);
  return url.pathname + url.search;
}
const navigate = (replace: boolean) => (to: string) => {
  const url = new URL(to, window.location.href);
  if (url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }
  const next = url.pathname + url.search + url.hash;
  if (replace) window.history.replaceState(null, "", next);
  else window.history.pushState(null, "", next);
  // Clerk's hash router and `useMode` below both listen for this.
  window.dispatchEvent(new PopStateEvent("popstate"));
};
const routerPush = navigate(false);
const routerReplace = navigate(true);
function useMode() {
  const [mode, setMode] = useState(readMode);
  useEffect(() => {
    const update = () => setMode(readMode());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return mode;
}

/**
 * Set when a Fairshare sign-out could not end the Clerk session. While it is
 * set, a live Clerk session is offered behind a button instead of being
 * exchanged automatically, so signing out can never sign straight back in.
 */
const keptKey = "fairshare_clerk_kept";
const kept = {
  read: () => {
    try {
      return window.sessionStorage.getItem(keptKey) === "1";
    } catch {
      return false;
    }
  },
  write: (value: boolean) => {
    try {
      if (value) window.sessionStorage.setItem(keptKey, "1");
      else window.sessionStorage.removeItem(keptKey);
    } catch {}
  },
};

/** Fits the card to the page: flat, bordered, in the page's type. Behaviour stays Clerk's. */
const line = "#DCDFD4";
// Previews the card as a production Clerk instance renders it (no development
// notice). Off unless set, so a development instance still says what it is.
const preview = process.env.EXPO_PUBLIC_CLERK_PREVIEW_PRODUCTION === "1";
const appearance = {
  options: { unsafe_disableDevelopmentModeWarnings: preview },
  variables: {
    colorPrimary: palette.green,
    colorForeground: palette.ink,
    colorDanger: palette.red,
    borderRadius: "10px",
    fontFamily: sans,
    fontSize: "15px",
    spacing: "0.9rem",
  },
  elements: {
    rootBox: { width: "100%" },
    cardBox: {
      width: "100%",
      maxWidth: "100%",
      boxShadow: "none",
      border: "none",
      borderRadius: "0",
    },
    card: {
      boxShadow: "none",
      borderRadius: "0",
      padding: "26px 32px 22px",
      gap: "22px",
    },
    headerTitle: {
      fontFamily: display,
      fontSize: "24px",
      fontWeight: 600,
      letterSpacing: "-0.4px",
    },
    header: { textAlign: "left", alignItems: "flex-start" },
    headerSubtitle: { fontSize: "15px", color: "#4E564E" },
    socialButtonsBlockButton: {
      boxShadow: "none",
      border: `1px solid ${line}`,
      height: "44px",
    },
    formFieldInput: {
      boxShadow: "none",
      border: `1px solid ${line}`,
      height: "44px",
    },
    formButtonPrimary: {
      boxShadow: "none",
      backgroundImage: "none",
      backgroundColor: palette.green,
      height: "44px",
      fontSize: "15px",
      fontWeight: 600,
      "&:hover": { backgroundColor: "#365A34" },
      "&::after": { display: "none" },
    },
    buttonArrowIcon: { display: "none" },
    formFieldAction__identifier: { display: "none" },
    // The footer's layout (one quiet line) is set in WebPolish.
    footerActionText: { fontSize: "14px" },
    footerActionLink: { fontSize: "14px", fontWeight: 600 },
  },
};
const localization = {
  signIn: {
    start: {
      title: "Sign in",
      subtitle: "Open your tabs and pick up where you left off.",
    },
  },
  signUp: {
    start: {
      title: "Create your account",
      subtitle: "Free, and it takes about a minute.",
    },
  },
};

export function ClerkRoot({
  publishableKey,
  children,
}: {
  publishableKey: string;
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      tokenCache={tokenCache}
      appearance={appearance}
      localization={localization}
      routerPush={routerPush}
      routerReplace={routerReplace}
    >
      {children}
    </ClerkProvider>
  );
}

/** Ends the Clerk session in this browser. The Fairshare session is cleared separately. */
export async function signOutOfClerk(_publishableKey: string) {
  const clerk = (window as any).Clerk;
  try {
    // Clerk's script may not have loaded; its session cookie can still be alive.
    if (!clerk?.loaded) throw new Error("Clerk is not loaded");
    await clerk.signOut({ redirectUrl: cardUrl("sign-in") });
    kept.write(false);
  } catch (e) {
    kept.write(true);
    throw e;
  }
}

const messageOf = (error: unknown) => {
  const e = error as {
    errors?: { longMessage?: string; message?: string }[];
    message?: string;
  };
  return (
    e?.errors?.[0]?.longMessage ||
    e?.errors?.[0]?.message ||
    e?.message ||
    "Something went wrong. Please try again."
  );
};

/** Frames the states that have no Clerk card around them. */
const panel = { gap: 14, padding: 28 };

type Props = {
  onSession: (result: any) => Promise<void>;
  onUsePhone: () => void;
};

/**
 * Clerk's card while signed out. Once Clerk reports a session (a sign-in just
 * finished, the page came back from Google, or a returning visitor's session
 * is still alive) it is exchanged for the Fairshare session at
 * POST /api/auth/clerk without another tap.
 */
export function ClerkAccess({ onSession, onUsePhone }: Props) {
  const { isLoaded, isSignedIn, sessionId } = useAuth();
  const clerk = useClerk();
  const { user: clerkUser } = useUser();
  const mode = useMode();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [manual, setManual] = useState(kept.read);
  const pending = useRef(false);
  // One automatic attempt per Clerk session; after a failure the person decides.
  const attempted = useRef<string | null>(null);
  // Clerk loads over the network; say so instead of spinning forever.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }, []);
  const exchange = useCallback(
    () =>
      run(async () => {
        const token = await clerk.session?.getToken();
        if (!token)
          throw new Error("Your sign-in did not finish. Please try again.");
        const name = (clerk.user?.fullName || clerk.user?.username || "")
          .trim()
          .slice(0, 80);
        const result = await api("/auth/clerk", "POST", {
          token,
          ...(name ? { name } : {}),
        });
        kept.write(false);
        // Drop the card's step and the sign-up marker from the address bar.
        window.history.replaceState(null, "", cardUrl("sign-in"));
        await onSession(result);
      }),
    [clerk, onSession, run],
  );
  const signOut = () =>
    run(async () => {
      await clerk.signOut({ redirectUrl: cardUrl("sign-in") });
      kept.write(false);
      setManual(false);
      attempted.current = null;
    });

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      // The session is gone, so there is nothing left to hold back.
      kept.write(false);
      setManual(false);
      attempted.current = null;
      return;
    }
    if (manual || !sessionId || attempted.current === sessionId) return;
    attempted.current = sessionId;
    void exchange();
  }, [isLoaded, isSignedIn, sessionId, manual, exchange]);

  const phoneLink = (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onUsePhone}
      style={{
        paddingHorizontal: 32,
        paddingBottom: 22,
      }}
    >
      <Text style={{ fontFamily: sans, fontSize: 14, color: "#4E564E" }}>
        Joined with a phone number?{" "}
        <Text style={{ color: C.green, fontWeight: "600" }}>
          Sign in with it
        </Text>
      </Text>
    </Pressable>
  );
  if (!isLoaded)
    return (
      <View style={{ gap: 14 }}>
        {slow ? (
          <Text
            accessibilityRole="alert"
            style={{ color: C.muted, lineHeight: 22 }}
          >
            Sign-in is not available right now. Check your connection and
            reload, or use your phone number and password.
          </Text>
        ) : (
          <ActivityIndicator color={C.green} />
        )}
        {phoneLink}
      </View>
    );
  if (isSignedIn) {
    const signedInAs =
      clerkUser?.primaryEmailAddress?.emailAddress ||
      clerkUser?.username ||
      "your account";
    const waiting = !error && !manual;
    return (
      <View style={panel}>
        {waiting ? (
          <>
            <ActivityIndicator color={C.green} />
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: C.muted, lineHeight: 22, textAlign: "center" }}
            >
              Signed in as {signedInAs}. Opening your groups and expenses…
            </Text>
          </>
        ) : (
          <>
            <Text style={{ color: C.ink, lineHeight: 22 }}>
              {error
                ? `You’re signed in as ${signedInAs}, but Fairshare could not open your account.`
                : `You’re still signed in as ${signedInAs}.`}
            </Text>
            {!!error && (
              <Text accessibilityRole="alert" style={{ color: C.red }}>
                {error}
              </Text>
            )}
            <Button
              label={busy ? "Please wait…" : error ? "Try again" : "Continue"}
              disabled={busy}
              onPress={() => void exchange()}
            />
            <Button
              secondary
              label="Sign out"
              disabled={busy}
              onPress={() => void signOut()}
            />
          </>
        )}
      </View>
    );
  }
  // Clerk fetches the card's code after its core script; cover the gap.
  const loading = <ActivityIndicator color={C.green} />;
  const signInUrl = cardUrl("sign-in");
  const signUpUrl = cardUrl("sign-up");
  return (
    <View>
      {mode === "sign-up" ? (
        <SignUp
          fallback={loading}
          routing="hash"
          signInUrl={signInUrl}
          forceRedirectUrl={signInUrl}
          signInForceRedirectUrl={signInUrl}
        />
      ) : (
        <SignIn
          fallback={loading}
          routing="hash"
          signUpUrl={signUpUrl}
          forceRedirectUrl={signInUrl}
          signUpForceRedirectUrl={signInUrl}
        />
      )}
      {phoneLink}
    </View>
  );
}

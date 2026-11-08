import { Platform, Share } from "react-native";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import * as SecureStore from "expo-secure-store";
import { inviteTokenFrom } from "../shared/onboarding";
const storageKey = "fairshare_pending_invite";
export function appOrigin() {
  if (Platform.OS === "web") return window.location.origin;
  return (
    process.env.EXPO_PUBLIC_APP_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    "https://fairshare-five-chi.vercel.app"
  ).replace(/\/$/, "");
}
export async function rememberInvite(token: string) {
  if (Platform.OS === "web") {
    try {
      window.sessionStorage.setItem(storageKey, token);
    } catch {}
  } else await SecureStore.setItemAsync(storageKey, token);
}
export async function initialInvite() {
  const url = await Linking.getInitialURL();
  const direct = url ? inviteTokenFrom(url) : null;
  if (direct) {
    await rememberInvite(direct);
    return direct;
  }
  if (Platform.OS === "web") {
    try {
      return window.sessionStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(storageKey);
}
export async function forgetInvite() {
  if (Platform.OS === "web") {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {}
    const url = new URL(window.location.href);
    url.searchParams.delete("invite");
    if (new URLSearchParams(url.hash.slice(1)).has("join")) url.hash = "";
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  } else await SecureStore.deleteItemAsync(storageKey);
}
export async function copyText(value: string) {
  const copied = await Clipboard.setStringAsync(value);
  if (!copied)
    throw new Error(
      "Clipboard is unavailable. Select and copy the text instead.",
    );
}
export async function shareInvite(url: string, groupName: string) {
  if (Platform.OS === "web") {
    if (navigator.share) {
      await navigator.share({
        title: `Join ${groupName} on Fairshare`,
        text: `Join ${groupName} to share expenses.`,
        url,
      });
      return "Share sheet opened";
    }
    await copyText(url);
    return "Invite link copied — paste it into your message";
  }
  const result = await Share.share({
    message: `Join ${groupName} on Fairshare: ${url}`,
  });
  return result.action === Share.sharedAction
    ? "Invite shared"
    : "Sharing cancelled";
}

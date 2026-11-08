import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
let accessToken = "";
const base = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "web" && __DEV__ ? "http://localhost:3001" : "")
).replace(/\/$/, "");
export async function restoreSession() {
  if (Platform.OS !== "web")
    accessToken = (await SecureStore.getItemAsync("fairshare_session")) || "";
}
export async function saveSession(token: string) {
  if (Platform.OS !== "web") {
    accessToken = token;
    await SecureStore.setItemAsync("fairshare_session", token);
  }
}
export async function clearSession() {
  accessToken = "";
  if (Platform.OS !== "web")
    await SecureStore.deleteItemAsync("fairshare_session");
}
export async function api(path: string, method = "GET", body?: unknown) {
  if (Platform.OS !== "web" && !base)
    throw new Error(
      "Set EXPO_PUBLIC_API_URL to your backend URL for native devices.",
    );
  let response: Response;
  try {
    response = await fetch(base + "/api" + path, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "Cannot reach Fairshare. Check your connection and backend URL.",
    );
  }
  const data = await response
    .json()
    .catch(() => ({ error: "The server returned an unexpected response" }));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

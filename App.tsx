import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { C, icon, Button, Field, Pills, Card, Tag } from "./client/components";
import { AgentSetup } from "./client/AgentSetup";
import {
  appOrigin,
  copyText,
  shareInvite,
  initialInvite,
  rememberInvite,
  forgetInvite,
} from "./client/invitations";
import {
  inviteTokenFrom,
  inviteLink,
  agentConnectionLabel,
} from "./shared/onboarding";
import * as ImagePicker from "expo-image-picker";
import { api, saveSession, clearSession, restoreSession } from "./client/api";
import {
  money,
  parseMoney,
  equalSplit,
  currencies,
  categories,
  type ExpenseInput,
} from "./shared/domain";
const today = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};
export default function App() {
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const [user, setUser] = useState<any>(null),
    [boot, setBoot] = useState(true),
    [groups, setGroups] = useState<any[]>([]),
    [group, setGroup] = useState<any>(null),
    [selected, setSelected] = useState(""),
    [tab, setTab] = useState("Expenses");
  const [authMode, setAuthMode] = useState("register"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState(""),
    [form, setForm] = useState<any>({}),
    [newKey, setNewKey] = useState(""),
    [image, setImage] = useState(""),
    [search, setSearch] = useState("");
  const [pendingInvite, setPendingInvite] = useState<string | null>(null),
    [invitation, setInvitation] = useState<any>(null),
    [inviteError, setInviteError] = useState("");
  const inviteRequest = useRef(0);
  async function showInvite(token: string) {
    const request = ++inviteRequest.current;
    setPendingInvite(token);
    setInvitation(null);
    setInviteError("");
    await rememberInvite(token);
    try {
      const preview = await api("/invites/preview", "POST", {
        inviteToken: token,
      });
      if (request === inviteRequest.current) setInvitation(preview);
    } catch (e) {
      if (request === inviteRequest.current)
        setInviteError((e as Error).message);
    }
  }
  async function dismissInvite() {
    inviteRequest.current++;
    await forgetInvite();
    setPendingInvite(null);
    setInvitation(null);
    setInviteError("");
    setError("");
  }
  async function acceptInvite() {
    await run(async () => {
      const result = await api("/groups/join", "POST", {
        inviteToken: pendingInvite,
      });
      await loadGroups(result.id);
      await dismissInvite();
      setTab("Expenses");
      setNotice("You joined the group");
    });
  }
  function closeModal() {
    setModal("");
    setNewKey("");
    setForm({});
    setError("");
  }
  async function checkAgent(agentId: string) {
    const updated = await api("/groups/" + selected);
    setGroup(updated);
    const agent = updated.agents.find((a: any) => a.id === agentId);
    if (!agent) throw new Error("This agent is no longer available.");
    return agent;
  }
  const peopleLink = group?.invite_token
    ? inviteLink(appOrigin(), group.invite_token)
    : "";
  async function loadGroups(prefer?: string) {
    const all = await api("/groups");
    setGroups(all);
    const id = prefer || selected || all[0]?.id;
    if (id) {
      setSelected(id);
      setGroup(await api("/groups/" + id));
    } else setGroup(null);
  }
  async function refresh() {
    if (selected) setGroup(await api("/groups/" + selected));
  }
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void (async () => {
      try {
        const token = await initialInvite();
        if (token) await showInvite(token);
        await restoreSession();
        const me = await api("/me");
        setUser(me);
        await loadGroups();
      } catch {
      } finally {
        setBoot(false);
      }
    })();
  }, []);
  useEffect(() => {
    const receive = (url: string) => {
      const token = inviteTokenFrom(url);
      if (token) void showInvite(token);
    };
    const sub = Linking.addEventListener("url", (event) => receive(event.url));
    const hashChange = () => receive(window.location.href);
    if (Platform.OS === "web")
      window.addEventListener("hashchange", hashChange);
    return () => {
      sub.remove();
      if (Platform.OS === "web")
        window.removeEventListener("hashchange", hashChange);
    };
  }, []);
  async function authenticate() {
    await run(async () => {
      const data = await api("/auth/" + authMode, "POST", {
        name,
        email,
        password,
      });
      await saveSession(data.token);
      setUser(data.user);
      setPassword("");
      await loadGroups();
    });
  }
  function open(kind: string, initial: any = {}) {
    setError("");
    setNotice("");
    setImage("");
    setNewKey("");
    setForm({
      name: "",
      currency: "USD",
      title: "",
      amount: "",
      paidBy:
        group?.members.find((m: any) => m.user_id === user.id)?.id ||
        group?.members[0]?.id,
      spentOn: today(),
      category: "Food & drink",
      audience: "Whole group",
      splitMode: "Equal",
      participants: group?.members.map((m: any) => m.id) || [],
      exact: {},
      ...initial,
    });
    setModal(kind);
  }
  const memberName = (id: string) =>
    group?.members.find((m: any) => m.id === id)?.name || "Member";
  const set = (key: string, value: any) =>
    setForm((f: any) => ({ ...f, [key]: value }));
  function expenseData(): ExpenseInput {
    if (!form.participants?.length)
      throw new Error("Choose at least one person to split this expense with.");
    const amountMinor = parseMoney(form.amount);
    const splits =
      form.splitMode === "Equal"
        ? equalSplit(amountMinor, form.participants)
        : form.participants.map((memberId: string) => ({
            memberId,
            amountMinor: parseMoney(form.exact[memberId] || "", true),
          }));
    if (
      splits.reduce((n: number, part: any) => n + part.amountMinor, 0) !==
      amountMinor
    )
      throw new Error("The exact shares must add up to the total.");
    return {
      title: form.title,
      amountMinor,
      paidBy: form.paidBy,
      splits,
      category: form.category,
      spentOn: form.spentOn,
    };
  }
  async function submit() {
    await run(async () => {
      const path = "/groups/" + selected;
      let done = "Saved";
      if (modal === "New group") {
        const g = await api("/groups", "POST", {
          name: form.name,
          currency: form.currency,
        });
        await loadGroups(g.id);
        done = "Your group is ready";
      } else if (modal === "Join a group") {
        const token = inviteTokenFrom(form.inviteInput || "");
        if (!token)
          throw new Error("Paste the full invitation link you received.");
        await showInvite(token);
        closeModal();
        return;
      } else if (modal === "Add person") {
        await api(path + "/members", "POST", { name: form.name });
        await refresh();
        done = "Member added";
      } else if (modal === "Add agent") {
        const a = await api(path + "/agents", "POST", { name: form.name });
        setNewKey(a.key);
        setForm((f: any) => ({ ...f, agentId: a.id }));
        await refresh();
        return;
      } else if (modal === "Replace invitation link") {
        await api(path + "/invite", "POST");
        await refresh();
        done = "New invitation link created. The old link no longer works.";
      } else if (modal === "Record payment") {
        await api(path + "/settlements", "POST", {
          fromMember: form.from,
          toMember: form.to,
          amountMinor: parseMoney(form.amount),
          note: form.note || "",
        });
        await refresh();
        done = "Payment recorded";
      } else if (modal === "Remove expense") {
        await api(path + "/expenses/" + form.id, "DELETE");
        await refresh();
        done = "Expense removed; history preserved";
      } else if (modal === "Revoke agent") {
        await api(path + "/agents/" + form.id, "DELETE");
        await refresh();
        done = "Agent access revoked";
      } else if (modal === "Review receipt") {
        await api(path + "/receipts/" + form.receiptId + "/review", "POST", {
          action: "approve",
          expense: expenseData(),
        });
        await refresh();
        done = "Receipt approved and added to expenses";
      } else if (modal === "Submit receipt") {
        await api(path + "/receipts", "POST", {
          ...expenseData(),
          currency: group.currency,
          sourceId: "manual-" + Date.now(),
          ...(image ? { imageData: image } : {}),
          notes: form.notes || "",
        });
        await refresh();
        done = "Receipt sent to the inbox";
      } else if (modal === "Add expense") {
        await api(path + "/expenses", "POST", expenseData());
        await refresh();
        done = "Expense added";
      }
      closeModal();
      setNotice(done);
    });
  }
  async function review(r: any) {
    const p = r.payload;
    open("Review receipt", {
      title: p.title,
      amount: (p.amountMinor / 100).toFixed(2),
      paidBy: p.paidBy,
      spentOn: p.spentOn,
      category: p.category,
      audience:
        p.splits.length === group.members.length
          ? "Whole group"
          : "Selected people",
      splitMode: "Exact",
      participants: p.splits.map((x: any) => x.memberId),
      exact: Object.fromEntries(
        p.splits.map((x: any) => [
          x.memberId,
          (x.amountMinor / 100).toFixed(2),
        ]),
      ),
      receiptId: r.id,
      notes: p.notes || "",
      source: r.agent_id
        ? group.agents.find((a: any) => a.id === r.agent_id)?.name
        : "Manual upload",
    });
    if (r.has_image)
      await run(async () => {
        const result = await api(
          "/groups/" + selected + "/receipts/" + r.id + "/image",
        );
        setImage(result.imageData);
      });
  }
  async function pickImage() {
    await run(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        base64: true,
        quality: 0.5,
      });
      if (!result.canceled) {
        const asset = result.assets[0];
        if (!asset.base64) throw new Error("Could not read image");
        if (asset.base64.length > 1398104)
          throw new Error("Choose a smaller receipt image (up to 1 MB).");
        setImage(
          `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`,
        );
      }
    });
  }
  const total =
    group?.expenses
      .filter((e: any) => !e.voided_at)
      .reduce((sum: number, e: any) => sum + e.amount_minor, 0) || 0;
  const pending =
    group?.receipts.filter((r: any) => r.status === "pending") || [];
  const me = group?.members.find((m: any) => m.user_id === user?.id);
  const myBalance = group?.balances[me?.id] || 0;
  const owner = group?.owner_id === user?.id;
  const isExpense = [
    "Add expense",
    "Submit receipt",
    "Review receipt",
  ].includes(modal);
  let equalShares: Record<string, number> = {};
  try {
    if (form.participants?.length)
      equalShares = Object.fromEntries(
        equalSplit(parseMoney(form.amount || ""), form.participants).map(
          (part) => [part.memberId, part.amountMinor],
        ),
      );
  } catch {}
  if (boot)
    return (
      <View style={[s.root, s.center]}>
        <ActivityIndicator color={C.green} />
        <Text style={s.muted}>Getting things together…</Text>
      </View>
    );
  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      {!user ? (
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            padding: wide ? 64 : 24,
            justifyContent: "center",
          }}
        >
          <View
            style={{
              flexDirection: wide ? "row" : "column",
              gap: wide ? 90 : 35,
              maxWidth: 1120,
              width: "100%",
              alignSelf: "center",
              alignItems: wide ? "center" : undefined,
            }}
          >
            <View style={{ flex: 1, gap: 24 }}>
              <View style={s.row}>
                <View style={s.logo}>{icon("layers", 24, "white")}</View>
                <Text style={s.brand}>
                  fairshare<Text style={{ color: C.green }}>.</Text>
                </Text>
              </View>
              <Text
                style={{
                  fontSize: wide ? 62 : 42,
                  fontWeight: "700",
                  lineHeight: wide ? 68 : 48,
                  color: C.ink,
                  letterSpacing: -2,
                }}
              >
                Good times.{"\n"}Shared fairly.
              </Text>
              <Text
                style={[
                  s.muted,
                  { fontSize: 18, lineHeight: 29, maxWidth: 430 },
                ]}
              >
                A little less math. A lot more together. Split everyday expenses
                and let your agents handle the receipts.
              </Text>
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <Tag text="BUILT FOR PEOPLE" />
                <Tag text="READY FOR AGENTS" />
              </View>
              <Card
                style={{
                  marginTop: 12,
                  transform: [{ rotate: "-2deg" }],
                  maxWidth: 380,
                  backgroundColor: C.pale,
                }}
              >
                <View style={s.between}>
                  <Text style={s.subtitle}>Weekend away</Text>
                  {icon("sun", 24, C.green)}
                </View>
                <Text style={[s.muted, { marginTop: 10 }]}>
                  Dinner, the cabin, and a coffee or two.
                </Text>
                <View style={[s.between, { marginTop: 24 }]}>
                  <Text style={s.label}>Everyone’s on the same page.</Text>
                  {icon("check-circle", 22, C.green)}
                </View>
              </Card>
            </View>
            <Card style={{ width: wide ? 410 : "100%", padding: 32, gap: 8 }}>
              {pendingInvite && (
                <View
                  style={{
                    padding: 16,
                    backgroundColor: C.pale,
                    borderRadius: 10,
                    gap: 10,
                    marginBottom: 16,
                  }}
                >
                  <Text style={s.subtitle}>
                    {invitation
                      ? `Join ${invitation.name}`
                      : inviteError
                        ? "Invitation unavailable"
                        : "Opening your invitation…"}
                  </Text>
                  <Text style={s.muted}>
                    {inviteError ||
                      "Sign in or create an account, then join this group. Your invitation will be kept while you sign in."}
                  </Text>
                  <Button
                    secondary
                    small
                    label="Dismiss invitation"
                    onPress={() => void dismissInvite()}
                  />
                </View>
              )}
              <Text style={s.heading}>
                {authMode === "register"
                  ? "Make room for everyone."
                  : "Welcome back."}
              </Text>
              <Text style={[s.muted, { marginBottom: 20 }]}>
                {authMode === "register"
                  ? "Your next shared adventure starts here."
                  : "Pick up right where you left off."}
              </Text>
              {authMode === "register" && (
                <Field
                  label="Your name"
                  value={name}
                  onChangeText={setName}
                  autoComplete="name"
                />
              )}
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={
                  authMode === "register" ? "new-password" : "current-password"
                }
                placeholder={
                  authMode === "register"
                    ? "At least 10 characters"
                    : "Your password"
                }
              />
              {error && (
                <Text accessibilityRole="alert" style={s.error}>
                  {error}
                </Text>
              )}
              <Button
                label={
                  busy
                    ? "One moment…"
                    : authMode === "register"
                      ? "Create your account →"
                      : "Sign in →"
                }
                onPress={authenticate}
                disabled={busy}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setAuthMode(authMode === "register" ? "login" : "register");
                  setError("");
                }}
                style={{ paddingTop: 15 }}
              >
                <Text style={[s.muted, { textAlign: "center" }]}>
                  {authMode === "register"
                    ? "Already here? Sign in"
                    : "New here? Create an account"}
                </Text>
              </Pressable>
            </Card>
          </View>
        </ScrollView>
      ) : pendingInvite ? (
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: 24,
          }}
        >
          <Card
            style={{
              maxWidth: 520,
              width: "100%",
              alignSelf: "center",
              gap: 20,
            }}
          >
            <Tag text="INVITATION FOR PEOPLE" />
            <Text style={s.heading}>
              {invitation
                ? `Join ${invitation.name}`
                : inviteError
                  ? "This invitation is unavailable"
                  : "Opening your invitation…"}
            </Text>
            {invitation && (
              <>
                <Text style={s.muted}>
                  {invitation.member_count} members · {invitation.currency}
                </Text>
                <Text style={[s.muted, { lineHeight: 23 }]}>
                  Join as {user.name} to see the group’s expenses and balances,
                  add expenses, and review receipt drafts.
                </Text>
                <Text style={[s.muted, { lineHeight: 21 }]}>
                  Joining creates your own profile. If the owner already tracks
                  someone with your name, that named person’s earlier shares
                  stay separate.
                </Text>
              </>
            )}
            {!!inviteError && (
              <Text accessibilityRole="alert" style={s.error}>
                {inviteError}
              </Text>
            )}
            {!!error && (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            )}
            <Button
              label={busy ? "Joining…" : "Join group"}
              disabled={busy || !invitation || !!inviteError}
              onPress={() => void acceptInvite()}
            />
            <Button
              secondary
              label="Not now"
              disabled={busy}
              onPress={() => void dismissInvite()}
            />
          </Card>
        </ScrollView>
      ) : (
        <View style={{ flex: 1, flexDirection: wide ? "row" : "column" }}>
          <View
            style={[
              s.sidebar,
              !wide && {
                width: "100%",
                padding: 16,
                borderRightWidth: 0,
                borderBottomWidth: 1,
                borderBottomColor: C.line,
              },
            ]}
          >
            <View style={s.row}>
              <View style={s.logo}>{icon("layers", 22, "white")}</View>
              <Text style={s.brand}>
                fairshare<Text style={{ color: C.green }}>.</Text>
              </Text>
            </View>
            {wide && (
              <Text style={[s.eyebrow, { marginTop: 48, marginBottom: 14 }]}>
                YOUR GROUPS
              </Text>
            )}
            <ScrollView
              horizontal={!wide}
              style={
                !wide ? { maxHeight: 64, marginTop: 15 } : { marginTop: 4 }
              }
              contentContainerStyle={{ gap: 7 }}
            >
              {groups.map((g) => (
                <Pressable
                  key={g.id}
                  accessibilityRole="button"
                  onPress={() =>
                    void run(async () => {
                      setSelected(g.id);
                      setGroup(await api("/groups/" + g.id));
                      setNotice("");
                    })
                  }
                  style={[
                    s.groupItem,
                    selected === g.id && { backgroundColor: C.pale },
                  ]}
                >
                  {icon("users", 18, selected === g.id ? C.green : C.muted)}
                  <Text
                    style={{
                      color: selected === g.id ? C.green : C.ink,
                      fontWeight: "600",
                      flexShrink: 1,
                    }}
                  >
                    {g.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View
              style={{
                gap: 10,
                marginTop: wide ? 18 : 12,
                flexDirection: wide ? "column" : "row",
              }}
            >
              <Button
                label="+ New group"
                secondary
                onPress={() => open("New group")}
                small
              />
              <Button
                label="Open invite link"
                secondary
                onPress={() => open("Join a group")}
                small
              />
            </View>
            {wide && <View style={{ flex: 1, minHeight: 30 }} />}
            <View style={[s.row, { marginTop: wide ? 32 : 14 }]}>
              <View style={s.avatar}>
                <Text style={{ color: C.green, fontWeight: "700" }}>
                  {user.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{user.name}</Text>
                {wide && (
                  <Text style={[s.muted, { fontSize: 12 }]}>
                    A little more in balance
                  </Text>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                onPress={() =>
                  void run(async () => {
                    await api("/auth/logout", "POST");
                    await clearSession();
                    setUser(null);
                    setGroup(null);
                    setGroups([]);
                    setSelected("");
                  })
                }
              >
                {icon("log-out", 18, C.muted)}
              </Pressable>
            </View>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              padding: wide ? 40 : 20,
              paddingBottom: 60,
              maxWidth: 1350,
              width: "100%",
              alignSelf: "center",
            }}
          >
            <View
              style={[
                s.between,
                { gap: 20, flexWrap: "wrap", marginBottom: 30 },
              ]}
            >
              <View>
                <Text style={s.eyebrow}>SHARED LIFE, SIMPLIFIED</Text>
                <Text style={[s.pageTitle, { fontSize: wide ? 36 : 30 }]}>
                  {group?.name || "Your shared space"}
                </Text>
                <Text style={s.muted}>
                  {group
                    ? `${group.members.length} members · ${group.currency} · Everyone contributes, everyone belongs.`
                    : "Bring your people together, one group at a time."}
                </Text>
              </View>
              {group && (
                <Button
                  label="+ Add expense"
                  onPress={() => open("Add expense")}
                />
              )}
            </View>
            {error && !modal && (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            )}
            {notice && (
              <View style={s.notice}>
                {icon("check-circle", 16, C.green)}
                <Text style={{ color: C.green, flex: 1 }}>{notice}</Text>
                <Pressable
                  accessibilityLabel="Dismiss notification"
                  onPress={() => setNotice("")}
                >
                  {icon("x", 16, C.green)}
                </Pressable>
              </View>
            )}
            {!group ? (
              <Card
                style={{
                  padding: wide ? 60 : 25,
                  gap: 22,
                  alignItems: "flex-start",
                }}
              >
                <View
                  style={[
                    s.logo,
                    { width: 64, height: 64, backgroundColor: C.pale },
                  ]}
                >
                  {icon("users", 30, C.green)}
                </View>
                <Text style={s.heading}>Good company. Clear balances.</Text>
                <Text style={[s.muted, { maxWidth: 480, lineHeight: 25 }]}>
                  Create a group for your home, your next trip, or your weekly
                  dinner. Add friends by name, or invite them to join and
                  contribute.
                </Text>
                <Button
                  label="Create your first group →"
                  onPress={() => open("New group")}
                />
              </Card>
            ) : (
              <>
                <View style={[s.wrap, { gap: 16, marginBottom: 28 }]}>
                  <Card
                    style={{
                      flex: 1,
                      minWidth: 220,
                      backgroundColor: C.green,
                      borderColor: C.green,
                    }}
                  >
                    <View style={s.between}>
                      <Text style={{ color: "#C6DECF", fontSize: 13 }}>
                        Your balance
                      </Text>
                      {icon("arrow-up-right", 20, "#C6DECF")}
                    </View>
                    <Text style={[s.metric, { color: "white" }]}>
                      {money(Math.abs(myBalance), group.currency)}
                    </Text>
                    <Text style={{ color: "#C6DECF", fontSize: 13 }}>
                      {myBalance > 0
                        ? "You’re owed — thanks for picking it up."
                        : myBalance < 0
                          ? "You owe — a little settling to do."
                          : "All square. That feels good."}
                    </Text>
                  </Card>
                  <Card style={{ flex: 1, minWidth: 220 }}>
                    <View style={s.between}>
                      <Text style={s.muted}>Group spending</Text>
                      {icon("pie-chart", 20, C.muted)}
                    </View>
                    <Text style={s.metric}>{money(total, group.currency)}</Text>
                    <Text style={s.muted}>
                      {group.expenses.filter((e: any) => !e.voided_at).length}{" "}
                      shared expenses · all time
                    </Text>
                  </Card>
                  <Card
                    style={{
                      flex: 1,
                      minWidth: 220,
                      backgroundColor: "#EEF1E8",
                    }}
                  >
                    <View style={s.between}>
                      <Text style={s.muted}>Receipt inbox</Text>
                      {icon("inbox", 20, C.green)}
                    </View>
                    <Text style={s.metric}>
                      {pending.length}
                      <Text
                        style={{
                          fontSize: 17,
                          fontWeight: "400",
                          color: C.muted,
                        }}
                      >
                        {" "}
                        to review
                      </Text>
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setTab("Receipts")}
                    >
                      <Text style={{ color: C.green, fontWeight: "600" }}>
                        A second look, then split →
                      </Text>
                    </Pressable>
                  </Card>
                </View>
                <View
                  style={{
                    flexDirection: wide ? "row" : "column",
                    gap: 24,
                    alignItems: "flex-start",
                  }}
                >
                  <View style={{ flex: 1, width: "100%" }}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginBottom: 20 }}
                      contentContainerStyle={{
                        gap: 26,
                        borderBottomWidth: 1,
                        borderBottomColor: C.line,
                      }}
                    >
                      {[
                        "Expenses",
                        "Balances",
                        "Receipts",
                        "Agents",
                        "Members",
                      ].map((t) => (
                        <Pressable
                          key={t}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: tab === t }}
                          onPress={() => {
                            setTab(t);
                            setError("");
                          }}
                          style={{
                            paddingBottom: 14,
                            borderBottomWidth: 2,
                            borderBottomColor:
                              tab === t ? C.green : "transparent",
                          }}
                        >
                          <Text
                            style={{
                              fontWeight: "600",
                              color: tab === t ? C.green : C.muted,
                            }}
                          >
                            {t}
                            {t === "Receipts" && pending.length
                              ? ` (${pending.length})`
                              : ""}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    {tab === "Expenses" && (
                      <Card style={{ padding: 0, overflow: "hidden" }}>
                        <View style={[s.between, { padding: 22, gap: 10 }]}>
                          <Text style={s.subtitle}>The shared tab</Text>
                          <TextInput
                            accessibilityLabel="Search expenses"
                            value={search}
                            onChangeText={setSearch}
                            placeholder="Search expenses"
                            style={[
                              s.input,
                              {
                                maxWidth: 200,
                                flex: 1,
                                minHeight: 38,
                                fontSize: 12,
                              },
                            ]}
                          />
                        </View>
                        {group.expenses.filter((e: any) =>
                          e.title.toLowerCase().includes(search.toLowerCase()),
                        ).length === 0 ? (
                          <View style={{ padding: 28, gap: 12 }}>
                            <Text style={s.subtitle}>
                              {search
                                ? "No matching expenses"
                                : "Nothing on the tab. Yet."}
                            </Text>
                            <Text style={s.muted}>
                              {search
                                ? "Try a different search."
                                : "Add your first shared expense and we’ll do the math."}
                            </Text>
                          </View>
                        ) : (
                          group.expenses
                            .filter((e: any) =>
                              e.title
                                .toLowerCase()
                                .includes(search.toLowerCase()),
                            )
                            .map((e: any) => (
                              <View
                                key={e.id}
                                style={[
                                  s.listRow,
                                  e.voided_at && { opacity: 0.5 },
                                ]}
                              >
                                <View
                                  style={[
                                    s.avatar,
                                    {
                                      borderRadius: 12,
                                      backgroundColor: "#F0F1E9",
                                    },
                                  ]}
                                >
                                  {icon(
                                    e.category === "Food & drink"
                                      ? "coffee"
                                      : e.category === "Transport"
                                        ? "navigation"
                                        : e.category === "Stay"
                                          ? "home"
                                          : "shopping-bag",
                                    18,
                                    C.green,
                                  )}
                                </View>
                                <View style={{ flex: 1, gap: 5 }}>
                                  <Text
                                    style={[
                                      s.label,
                                      e.voided_at && {
                                        textDecorationLine: "line-through",
                                      },
                                    ]}
                                  >
                                    {e.title}
                                  </Text>
                                  <Text style={[s.muted, { fontSize: 12 }]}>
                                    {memberName(e.paid_by)} paid ·{" "}
                                    {String(e.spent_on).slice(0, 10)}
                                    {e.voided_at ? " · Removed" : ""}
                                  </Text>
                                </View>
                                <View
                                  style={{ alignItems: "flex-end", gap: 5 }}
                                >
                                  <Text style={s.label}>
                                    {money(e.amount_minor, group.currency)}
                                  </Text>
                                  <Text
                                    style={{ color: C.muted, fontSize: 11 }}
                                  >
                                    {e.splits.length}{" "}
                                    {e.splits.length === 1
                                      ? "person"
                                      : "people"}
                                  </Text>
                                </View>
                                {!e.voided_at &&
                                  (owner || e.created_by === user.id) && (
                                    <Pressable
                                      accessibilityRole="button"
                                      accessibilityLabel={"Remove " + e.title}
                                      onPress={() =>
                                        open("Remove expense", {
                                          id: e.id,
                                          title: e.title,
                                        })
                                      }
                                      style={{ padding: 5 }}
                                    >
                                      {icon("x", 15, C.muted)}
                                    </Pressable>
                                  )}
                              </View>
                            ))
                        )}
                      </Card>
                    )}
                    {tab === "Balances" && (
                      <View style={{ gap: 20 }}>
                        <Card>
                          <Text style={s.subtitle}>Everyone’s balance</Text>
                          <Text
                            style={[
                              s.muted,
                              { marginTop: 8, marginBottom: 16 },
                            ]}
                          >
                            Positive means owed. Negative means owing.
                          </Text>
                          {group.members.map((m: any) => (
                            <View
                              key={m.id}
                              style={[
                                s.between,
                                {
                                  paddingVertical: 14,
                                  borderTopWidth: 1,
                                  borderColor: C.line,
                                },
                              ]}
                            >
                              <Text style={s.label}>
                                {m.name}
                                {m.user_id === user.id ? " (you)" : ""}
                              </Text>
                              <Text
                                style={{
                                  color:
                                    group.balances[m.id] < 0 ? C.red : C.green,
                                  fontWeight: "600",
                                }}
                              >
                                {group.balances[m.id] > 0 ? "+" : ""}
                                {money(group.balances[m.id], group.currency)}
                              </Text>
                            </View>
                          ))}
                        </Card>
                        <Card>
                          <View style={s.between}>
                            <Text style={s.subtitle}>Recorded payments</Text>
                            <Button
                              label="Record payment"
                              small
                              secondary
                              onPress={() =>
                                open("Record payment", {
                                  from: group.members[0]?.id,
                                  to: group.members[1]?.id,
                                })
                              }
                            />
                          </View>
                          <Text style={[s.muted, { marginVertical: 12 }]}>
                            Keep track of money already paid outside Fairshare.
                          </Text>
                          {group.settlements.map((p: any) => (
                            <View
                              key={p.id}
                              style={[s.listRow, { paddingHorizontal: 0 }]}
                            >
                              {icon("check-circle", 19, C.green)}
                              <View style={{ flex: 1 }}>
                                <Text style={s.label}>
                                  {memberName(p.from_member)} →{" "}
                                  {memberName(p.to_member)}
                                </Text>
                                <Text
                                  style={[
                                    s.muted,
                                    { fontSize: 12, marginTop: 5 },
                                  ]}
                                >
                                  {p.note || "Payment recorded"} ·{" "}
                                  {String(p.created_at).slice(0, 10)}
                                </Text>
                              </View>
                              <Text style={s.label}>
                                {money(p.amount_minor, group.currency)}
                              </Text>
                            </View>
                          ))}
                          {!group.settlements.length && (
                            <Text style={s.muted}>
                              No payments recorded yet.
                            </Text>
                          )}
                        </Card>
                      </View>
                    )}
                    {tab === "Receipts" && (
                      <View style={{ gap: 16 }}>
                        <View style={s.between}>
                          <Text style={s.subtitle}>
                            A human touch, before the math.
                          </Text>
                          <Button
                            label="+ Receipt"
                            small
                            secondary
                            onPress={() => open("Submit receipt")}
                          />
                        </View>
                        <Text style={[s.muted, { lineHeight: 23 }]}>
                          Agents send receipt details here. Check the amount,
                          payer, and split before approving. Only approved
                          receipts affect balances.
                        </Text>
                        {!group.receipts.length && (
                          <Card>
                            <Text style={s.subtitle}>Your inbox is clear.</Text>
                            <Text style={[s.muted, { marginTop: 10 }]}>
                              Connect an agent or submit a receipt to get
                              started.
                            </Text>
                          </Card>
                        )}
                        {group.receipts.map((r: any) => (
                          <Card key={r.id}>
                            <View style={s.between}>
                              <Tag text={r.status.toUpperCase()} />
                              <Text style={s.label}>
                                {money(r.payload.amountMinor, group.currency)}
                              </Text>
                            </View>
                            <Text style={[s.subtitle, { marginTop: 16 }]}>
                              {r.payload.title}
                            </Text>
                            <Text
                              style={[
                                s.muted,
                                { marginTop: 8, marginBottom: 18 },
                              ]}
                            >
                              {r.agent_id
                                ? group.agents.find(
                                    (a: any) => a.id === r.agent_id,
                                  )?.name || "Agent"
                                : "Manual submission"}{" "}
                              · {r.payload.spentOn}
                            </Text>
                            {r.status === "pending" && (
                              <View style={s.row}>
                                <Button
                                  label="Review receipt →"
                                  small
                                  onPress={() => void review(r)}
                                />
                                <Button
                                  label="Reject"
                                  secondary
                                  small
                                  disabled={busy}
                                  onPress={() =>
                                    void run(async () => {
                                      await api(
                                        "/groups/" +
                                          selected +
                                          "/receipts/" +
                                          r.id +
                                          "/review",
                                        "POST",
                                        { action: "reject" },
                                      );
                                      await refresh();
                                      setNotice("Receipt rejected");
                                    })
                                  }
                                />
                              </View>
                            )}
                          </Card>
                        ))}
                      </View>
                    )}
                    {tab === "Agents" && (
                      <View style={{ gap: 18 }}>
                        <Card style={{ backgroundColor: C.pale, gap: 16 }}>
                          <View style={s.row}>
                            {icon("cpu", 24, C.green)}
                            <Text style={s.heading}>Bring your own agent.</Text>
                          </View>
                          <Text style={[s.muted, { lineHeight: 24 }]}>
                            Add an assistant that supports MCP tools or HTTPS
                            requests. We’ll guide you through setup. Agents send
                            receipt drafts; people review and approve them.
                          </Text>
                          {owner && (
                            <Button
                              label="Set up an agent"
                              onPress={() => open("Add agent")}
                            />
                          )}
                          <Text style={s.muted}>
                            Inviting a person? Use Members → Invite people.
                            Agent access is separate and stays private.
                          </Text>
                        </Card>
                        {group.agents.map((a: any) => (
                          <Card key={a.id}>
                            <View style={s.between}>
                              <View style={s.row}>
                                {icon("cpu", 20, C.green)}
                                <View>
                                  <Text style={s.label}>{a.name}</Text>
                                  <Text
                                    style={[
                                      s.muted,
                                      { fontSize: 12, marginTop: 5 },
                                    ]}
                                  >
                                    {agentConnectionLabel(a)}
                                    {a.last_used_at && !a.revoked_at
                                      ? ` · Last contact ${new Date(a.last_used_at).toLocaleString()}`
                                      : ""}
                                  </Text>
                                </View>
                              </View>
                              {owner && !a.revoked_at && (
                                <Button
                                  label="Setup"
                                  secondary
                                  small
                                  onPress={() =>
                                    open("Set up agent", {
                                      agentId: a.id,
                                      name: a.name,
                                    })
                                  }
                                />
                              )}
                              {owner && !a.revoked_at && (
                                <Button
                                  label="Revoke"
                                  secondary
                                  small
                                  onPress={() =>
                                    open("Revoke agent", {
                                      id: a.id,
                                      name: a.name,
                                    })
                                  }
                                />
                              )}
                            </View>
                          </Card>
                        ))}
                        <Text style={s.muted}>
                          Creating access is the first step. A connection is
                          verified only after your agent contacts Fairshare. No
                          one-click Claude or Grok sign-in is provided.
                        </Text>
                      </View>
                    )}
                    {tab === "Members" && (
                      <Card>
                        <View style={[s.between, { marginBottom: 20 }]}>
                          <Text style={s.subtitle}>
                            The people behind the plans
                          </Text>
                          {owner && (
                            <Button
                              label="Add person by name"
                              small
                              secondary
                              onPress={() => open("Add person")}
                            />
                          )}
                        </View>
                        {group.members.map((m: any) => (
                          <View
                            key={m.id}
                            style={[s.listRow, { paddingHorizontal: 0 }]}
                          >
                            <View style={s.avatar}>
                              <Text
                                style={{ fontWeight: "600", color: C.green }}
                              >
                                {m.name.slice(0, 1).toUpperCase()}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.label}>{m.name}</Text>
                              <Text
                                style={[
                                  s.muted,
                                  { fontSize: 12, marginTop: 5 },
                                ]}
                              >
                                {m.user_id
                                  ? "Account connected"
                                  : "Share tracked by name · no account or app access"}
                              </Text>
                            </View>
                          </View>
                        ))}
                        {owner && (
                          <View style={{ gap: 14, marginTop: 24 }}>
                            <Text style={s.subtitle}>Invite people</Text>
                            <Text style={[s.muted, { lineHeight: 22 }]}>
                              Send a link in a text, email, or chat. They open
                              it, sign in, and join this group. Anyone with the
                              link can join, so share it privately.
                            </Text>
                            <View style={s.wrap}>
                              <Button
                                label="Copy invite link"
                                onPress={() =>
                                  void run(async () => {
                                    await copyText(peopleLink);
                                    setNotice(
                                      "Invite link copied — paste it into a text or chat",
                                    );
                                  })
                                }
                              />
                              <Button
                                label="Share invitation"
                                secondary
                                onPress={() =>
                                  void run(async () => {
                                    setNotice(
                                      await shareInvite(peopleLink, group.name),
                                    );
                                  })
                                }
                              />
                            </View>
                            <Button
                              label="View invitation link"
                              secondary
                              small
                              onPress={() => open("Invitation link")}
                            />
                            <Button
                              label="Replace invitation link"
                              secondary
                              small
                              onPress={() => open("Replace invitation link")}
                            />
                            <Text style={[s.muted, { lineHeight: 21 }]}>
                              Just keeping track for someone? Add a person by
                              name above. They can have a share without signing
                              up. Inviting an account creates a separate
                              profile; it does not claim an existing named
                              person.
                            </Text>
                          </View>
                        )}
                      </Card>
                    )}
                  </View>
                  {wide && (
                    <View style={{ width: 260, gap: 20 }}>
                      <Card style={{ backgroundColor: "#F0F2E9" }}>
                        <Text style={s.eyebrow}>THE EASY WAY TO SETTLE</Text>
                        <Text
                          style={[
                            s.subtitle,
                            { marginTop: 12, marginBottom: 18 },
                          ]}
                        >
                          A few small payments.{"\n"}A fresh start.
                        </Text>
                        {group.transfers.length ? (
                          group.transfers.map((t: any, i: number) => (
                            <View
                              key={i}
                              style={{
                                paddingVertical: 14,
                                borderTopWidth: 1,
                                borderColor: "#DDE2D3",
                                gap: 10,
                              }}
                            >
                              <Text style={{ fontSize: 13, color: C.ink }}>
                                {memberName(t.from)} → {memberName(t.to)}
                              </Text>
                              <View style={s.between}>
                                <Text style={s.label}>
                                  {money(t.amountMinor, group.currency)}
                                </Text>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Record payment from ${memberName(t.from)} to ${memberName(t.to)}`}
                                  onPress={() =>
                                    open("Record payment", {
                                      ...t,
                                      amount: (t.amountMinor / 100).toFixed(2),
                                    })
                                  }
                                >
                                  <Text
                                    style={{
                                      color: C.green,
                                      fontWeight: "600",
                                      fontSize: 12,
                                    }}
                                  >
                                    Record ↗
                                  </Text>
                                </Pressable>
                              </View>
                            </View>
                          ))
                        ) : (
                          <Text style={[s.muted, { lineHeight: 22 }]}>
                            You’re all square. Time to make more memories.
                          </Text>
                        )}
                        <Text
                          style={[
                            s.muted,
                            { fontSize: 11, lineHeight: 17, marginTop: 16 },
                          ]}
                        >
                          Suggestions simplify the group’s debts. Payments
                          happen outside Fairshare.
                        </Text>
                      </Card>
                      <View style={{ padding: 10, gap: 12 }}>
                        {icon("shield", 24, C.green)}
                        <Text style={s.label}>Your agents. Your call.</Text>
                        <Text
                          style={[s.muted, { fontSize: 13, lineHeight: 21 }]}
                        >
                          Every agent receipt waits for your review. No surprise
                          expenses.
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
                {!wide && tab === "Balances" && (
                  <Card style={{ marginTop: 20 }}>
                    <Text style={s.subtitle}>Suggested payments</Text>
                    {group.transfers.map((t: any, i: number) => (
                      <View
                        key={i}
                        style={[s.between, { paddingTop: 18, gap: 10 }]}
                      >
                        <Text style={[s.muted, { flex: 1 }]}>
                          {memberName(t.from)} → {memberName(t.to)} ·{" "}
                          {money(t.amountMinor, group.currency)}
                        </Text>
                        <Button
                          label="Record"
                          small
                          secondary
                          onPress={() =>
                            open("Record payment", {
                              ...t,
                              amount: (t.amountMinor / 100).toFixed(2),
                            })
                          }
                        />
                      </View>
                    ))}
                    {!group.transfers.length && (
                      <Text style={[s.muted, { marginTop: 15 }]}>
                        Everyone is settled up.
                      </Text>
                    )}
                  </Card>
                )}
              </>
            )}
            <View
              style={[
                s.between,
                {
                  marginTop: 36,
                  paddingTop: 20,
                  borderTopWidth: 1,
                  borderColor: C.line,
                },
              ]}
            >
              <Text style={{ color: C.muted, fontSize: 11 }}>
                A little less math. A lot more together.
              </Text>
              <Text style={{ color: C.muted, fontSize: 11 }}>fairshare.</Text>
            </View>
          </ScrollView>
        </View>
      )}
      <Modal
        visible={!!modal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!busy) closeModal();
        }}
      >
        <View style={s.overlay}>
          <View
            style={[
              s.modal,
              { maxHeight: "92%", width: Math.min(width - 24, 580) },
            ]}
          >
            <View
              style={[
                s.between,
                { padding: 24, borderBottomWidth: 1, borderColor: C.line },
              ]}
            >
              <Text style={s.heading}>{modal}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close dialog"
                disabled={busy}
                onPress={closeModal}
              >
                {icon("x", 24, C.muted)}
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{ padding: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              {["New group", "Add person", "Add agent"].includes(modal) &&
                !form.agentId && (
                  <>
                    <Field
                      label={
                        modal === "New group"
                          ? "Group name"
                          : modal === "Add person"
                            ? "Member name"
                            : "Agent name"
                      }
                      value={form.name}
                      onChangeText={(v: string) => set("name", v)}
                      placeholder={
                        modal === "New group"
                          ? "e.g. Lisbon weekend"
                          : modal === "Add person"
                            ? "e.g. Alex"
                            : "e.g. Claude · travel receipts"
                      }
                    />
                    {modal === "New group" && (
                      <>
                        <Text style={s.label}>Group currency</Text>
                        <View style={{ marginVertical: 14 }}>
                          <Pills
                            items={[...currencies]}
                            value={form.currency}
                            onChange={(v: string) => set("currency", v)}
                          />
                        </View>
                        <Text style={s.muted}>
                          One currency per group keeps the math clear.
                        </Text>
                      </>
                    )}
                    {modal === "Add person" && (
                      <Text style={s.muted}>
                        Track this person’s share without an account. They will
                        not get a message or app access. To let them
                        participate, share a people invitation link from
                        Members.
                      </Text>
                    )}
                    {modal === "Add agent" && (
                      <Text style={[s.muted, { lineHeight: 23 }]}>
                        First create private access for this group, then follow
                        the setup guide in your agent client. Access alone does
                        not connect the agent. It can read member names and
                        submit drafts; only people approve expenses.
                      </Text>
                    )}
                  </>
                )}
              {form.agentId &&
                ["Add agent", "Set up agent"].includes(modal) && (
                  <AgentSetup
                    key={form.agentId}
                    agent={
                      group.agents.find((a: any) => a.id === form.agentId) || {
                        id: form.agentId,
                        name: form.name,
                      }
                    }
                    privateKey={newKey}
                    onCheck={() => checkAgent(form.agentId)}
                    onClose={closeModal}
                  />
                )}
              {modal === "Invitation link" && (
                <View style={{ gap: 16 }}>
                  <Text style={s.muted}>
                    Share this link privately with the people you want to join.
                  </Text>
                  <Text selectable style={s.code}>
                    {peopleLink}
                  </Text>
                  <Button
                    label="Copy invite link"
                    onPress={() =>
                      void run(async () => {
                        await copyText(peopleLink);
                        setNotice("Invite link copied");
                        closeModal();
                      })
                    }
                  />
                  <Button secondary label="Done" onPress={closeModal} />
                </View>
              )}
              {modal === "Join a group" && (
                <>
                  <Field
                    label="Invitation link"
                    value={form.inviteInput || ""}
                    onChangeText={(v: string) => set("inviteInput", v)}
                    autoCapitalize="none"
                    placeholder="Paste the link someone sent you"
                  />
                  <Text style={s.muted}>
                    Usually you can just tap the link in your message. Older
                    invite codes still work here.
                  </Text>
                </>
              )}
              {modal === "Replace invitation link" && (
                <Text style={[s.muted, { lineHeight: 23 }]}>
                  Create a new invitation link? The current link will stop
                  working. People who already joined will keep their access.
                </Text>
              )}
              {isExpense && (
                <>
                  {modal === "Review receipt" && (
                    <View style={[s.notice, { marginBottom: 18 }]}>
                      {icon("cpu", 18, C.green)}
                      <Text style={{ flex: 1, color: C.green }}>
                        Submitted by {form.source}. Check every detail below.
                      </Text>
                    </View>
                  )}
                  <Field
                    label="What was it for?"
                    value={form.title}
                    onChangeText={(v: string) => set("title", v)}
                    placeholder="e.g. Dinner at the corner café"
                  />
                  <View style={{ flexDirection: "row", gap: 16 }}>
                    <View style={{ flex: 1 }}>
                      <Field
                        label={`Amount (${group?.currency})`}
                        value={form.amount}
                        onChangeText={(v: string) => set("amount", v)}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Date (YYYY-MM-DD)"
                        value={form.spentOn}
                        onChangeText={(v: string) => set("spentOn", v)}
                        placeholder="2026-11-08"
                      />
                    </View>
                  </View>
                  <Text style={s.label}>Paid by</Text>
                  <View style={{ marginVertical: 12 }}>
                    <Pills
                      items={group?.members || []}
                      value={form.paidBy}
                      onChange={(v: string) => set("paidBy", v)}
                    />
                  </View>
                  <Text style={s.label}>Category</Text>
                  <View style={{ marginVertical: 12 }}>
                    <Pills
                      items={[...categories]}
                      value={form.category}
                      onChange={(v: string) => set("category", v)}
                    />
                  </View>
                  <View
                    style={[s.between, { marginTop: 10, marginBottom: 14 }]}
                  >
                    <Text style={s.label}>How should we split it?</Text>
                    <Pills
                      items={["Equal", "Exact"]}
                      value={form.splitMode}
                      onChange={(v: string) => set("splitMode", v)}
                    />
                  </View>
                  <Pills
                    items={["Whole group", "Selected people"]}
                    value={form.audience}
                    onChange={(v: string) =>
                      setForm((f: any) => ({
                        ...f,
                        audience: v,
                        participants:
                          v === "Whole group"
                            ? group.members.map((m: any) => m.id)
                            : f.participants,
                      }))
                    }
                  />
                  <Text
                    style={[s.muted, { marginVertical: 12, lineHeight: 21 }]}
                  >
                    {form.audience === "Whole group"
                      ? `Everyone in ${group.name} is included.`
                      : "Tick only the people sharing this expense. The payer can be different from the people splitting it."}{" "}
                    {form.participants?.length || 0} selected.
                  </Text>
                  {form.audience === "Selected people" && (
                    <View style={[s.row, { marginBottom: 12 }]}>
                      <Button
                        label="Select all"
                        secondary
                        small
                        onPress={() =>
                          set(
                            "participants",
                            group.members.map((m: any) => m.id),
                          )
                        }
                      />
                      <Button
                        label="Clear selection"
                        secondary
                        small
                        onPress={() => set("participants", [])}
                      />
                    </View>
                  )}
                  {group?.members.map((m: any) => (
                    <View
                      key={m.id}
                      style={[s.between, { marginBottom: 10, gap: 16 }]}
                    >
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{
                          checked: form.participants?.includes(m.id),
                        }}
                        onPress={() =>
                          setForm((f: any) => ({
                            ...f,
                            audience: "Selected people",
                            participants: f.participants.includes(m.id)
                              ? f.participants.filter(
                                  (id: string) => id !== m.id,
                                )
                              : [...f.participants, m.id],
                          }))
                        }
                        style={[s.row, { flex: 1, paddingVertical: 10 }]}
                      >
                        {icon(
                          form.participants?.includes(m.id)
                            ? "check-square"
                            : "square",
                          20,
                          C.green,
                        )}
                        <Text style={s.label}>{m.name}</Text>
                      </Pressable>
                      {form.splitMode === "Equal" &&
                        form.participants?.includes(m.id) &&
                        equalShares[m.id] !== undefined && (
                          <Text style={s.label}>
                            {money(equalShares[m.id], group.currency)}
                          </Text>
                        )}
                      {form.splitMode === "Exact" &&
                        form.participants?.includes(m.id) && (
                          <TextInput
                            accessibilityLabel={`Share for ${m.name}`}
                            keyboardType="decimal-pad"
                            value={form.exact?.[m.id] || ""}
                            onChangeText={(v) =>
                              set("exact", { ...form.exact, [m.id]: v })
                            }
                            placeholder="0.00"
                            style={[s.input, { width: 100, minHeight: 40 }]}
                          />
                        )}
                    </View>
                  ))}
                  {modal === "Submit receipt" && (
                    <View style={{ gap: 16, marginTop: 14 }}>
                      <Button
                        secondary
                        label={
                          image
                            ? "Change receipt image"
                            : "Attach receipt image (optional)"
                        }
                        onPress={pickImage}
                      />
                      <Text style={s.muted}>
                        PNG, JPEG, or WebP · up to 1 MB. Enter the receipt
                        details above; this form does not perform OCR.
                      </Text>
                    </View>
                  )}
                  {form.notes && (
                    <Text style={[s.muted, { marginVertical: 14 }]}>
                      {form.notes}
                    </Text>
                  )}
                  {image && (
                    <Image
                      accessibilityLabel="Receipt attachment"
                      source={{ uri: image }}
                      resizeMode="contain"
                      style={{
                        width: "100%",
                        height: 300,
                        marginTop: 15,
                        borderRadius: 12,
                        backgroundColor: C.bg,
                      }}
                    />
                  )}
                </>
              )}
              {modal === "Record payment" && (
                <>
                  <Text style={[s.muted, { lineHeight: 23, marginBottom: 20 }]}>
                    Record money that has already changed hands. Fairshare does
                    not send a payment.
                  </Text>
                  <Text style={s.label}>From</Text>
                  <View style={{ marginVertical: 12 }}>
                    <Pills
                      items={group?.members || []}
                      value={form.from}
                      onChange={(v: string) => set("from", v)}
                    />
                  </View>
                  <Text style={s.label}>To</Text>
                  <View style={{ marginVertical: 12 }}>
                    <Pills
                      items={group?.members || []}
                      value={form.to}
                      onChange={(v: string) => set("to", v)}
                    />
                  </View>
                  <Field
                    label={`Amount (${group?.currency})`}
                    value={form.amount}
                    onChangeText={(v: string) => set("amount", v)}
                    keyboardType="decimal-pad"
                  />
                  <Field
                    label="Note (optional)"
                    value={form.note || ""}
                    onChangeText={(v: string) => set("note", v)}
                    placeholder="e.g. Cash, bank transfer"
                  />
                </>
              )}
              {modal === "Remove expense" && (
                <Text style={[s.muted, { lineHeight: 24 }]}>
                  Remove “{form.title}” from balances? It will remain in the
                  activity history as removed.
                </Text>
              )}
              {modal === "Revoke agent" && (
                <Text style={[s.muted, { lineHeight: 24 }]}>
                  Revoke {form.name}’s key? It will no longer be able to submit
                  receipts. Existing receipts will stay in your inbox.
                </Text>
              )}
              {error && (
                <Text
                  accessibilityRole="alert"
                  style={[s.error, { marginTop: 18 }]}
                >
                  {error}
                </Text>
              )}
              {!form.agentId && modal !== "Invitation link" && (
                <View style={{ marginTop: 24, gap: 12 }}>
                  <Button
                    disabled={busy}
                    label={
                      busy
                        ? "Saving…"
                        : modal === "Review receipt"
                          ? "Approve & add expense"
                          : modal === "Remove expense"
                            ? "Remove expense"
                            : modal === "Revoke agent"
                              ? "Revoke access"
                              : modal === "Add agent"
                                ? "Create private access"
                                : modal === "Submit receipt"
                                  ? "Send to inbox"
                                  : modal === "Record payment"
                                    ? "Record payment"
                                    : modal === "Join a group"
                                      ? "Open invitation"
                                      : "Save"
                    }
                    onPress={submit}
                  />
                  <Button
                    secondary
                    label="Cancel"
                    disabled={busy}
                    onPress={closeModal}
                  />
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: "center", justifyContent: "center", gap: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  brand: { fontSize: 27, fontWeight: "700", letterSpacing: -1, color: C.ink },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: C.green,
    alignItems: "center",
    justifyContent: "center",
  },
  sidebar: {
    width: 244,
    padding: 24,
    backgroundColor: "#FCFCF9",
    borderRightWidth: 1,
    borderRightColor: C.line,
  },
  groupItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 10,
    padding: 14,
    minHeight: 48,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.7,
    fontWeight: "700",
    color: C.muted,
  },
  pageTitle: {
    fontWeight: "700",
    letterSpacing: -1.1,
    color: C.ink,
    marginTop: 9,
    marginBottom: 10,
  },
  heading: {
    fontSize: 23,
    fontWeight: "600",
    color: C.ink,
    letterSpacing: -0.5,
  },
  subtitle: { fontSize: 17, fontWeight: "600", color: C.ink },
  muted: { fontSize: 13, color: C.muted },
  label: { fontSize: 13, fontWeight: "600", color: C.ink },
  card: {
    backgroundColor: C.paper,
    borderRadius: 17,
    padding: 24,
    borderWidth: 1,
    borderColor: C.line,
  },
  metric: {
    fontSize: 33,
    fontWeight: "600",
    letterSpacing: -1,
    color: C.ink,
    marginVertical: 16,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: C.ink,
    backgroundColor: "#FDFEFC",
  },
  button: {
    backgroundColor: C.green,
    borderRadius: 9,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  buttonText: { fontWeight: "600", fontSize: 13, color: "white" },
  pill: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.paper,
  },
  tag: {
    backgroundColor: "#E7EFD8",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 5,
    alignSelf: "flex-start",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 22,
    paddingVertical: 19,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  notice: {
    padding: 15,
    borderRadius: 10,
    backgroundColor: C.pale,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    marginBottom: 18,
  },
  error: {
    color: C.red,
    backgroundColor: "#FFF0ED",
    padding: 14,
    borderRadius: 8,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 20,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(20,35,27,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  modal: { backgroundColor: C.paper, borderRadius: 20, overflow: "hidden" },
  code: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
    color: C.green,
    backgroundColor: C.bg,
    padding: 14,
    borderRadius: 8,
    lineHeight: 20,
  },
});

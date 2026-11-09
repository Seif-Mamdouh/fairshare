import React, { useEffect, useState, useRef } from "react";
import {
  View,
  SafeAreaView,
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
import { PhoneAuth } from "./client/PhoneAuth";
import { ExpenseHome } from "./client/ExpenseHome";
import { ExpenseEditor } from "./client/ExpenseEditor";
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
  const [summaries, setSummaries] = useState<any[]>([]);
  const [groupOpen, setGroupOpen] = useState(false);
  const [composeGroup, setComposeGroup] = useState("");
  const [phoneAvailable, setPhoneAvailable] = useState(false);
  const [authChannel, setAuthChannel] = useState("Email");
  const [authMode, setAuthMode] = useState("login"),
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
  useEffect(() => {
    void api("/auth/methods")
      .then((methods) => {
        setPhoneAvailable(methods.phone);
        if (methods.phone) setAuthChannel("Phone");
      })
      .catch(() => {});
  }, []);
  async function finishPhoneAuth(data: any) {
    await saveSession(data.token);
    setUser(data.user);
    await loadGroups();
    if (modal === "Account") {
      closeModal();
      setNotice("Phone verified and linked to your account");
    }
  }
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
      setGroupOpen(true);
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
    const details = await Promise.all(
      all.map((g: any) => api("/groups/" + g.id)),
    );
    setSummaries(details);
    const id = prefer || selected || all[0]?.id;
    const detail = details.find((g: any) => g.id === id) || details[0];
    setSelected(detail?.id || "");
    setGroup(detail || null);
  }
  async function selectGroup(id: string) {
    let detail;
    try {
      detail = await api("/groups/" + id);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
    setNotice("");
    setError("");
    setSelected(id);
    setGroup(detail);
    setGroupOpen(true);
  }
  async function refresh() {
    if (selected) {
      const detail = await api("/groups/" + selected);
      setGroup(detail);
      setSummaries((all) => all.map((g) => (g.id === detail.id ? detail : g)));
    }
  }
  useEffect(() => {
    if (composeGroup && group?.id === composeGroup) {
      setComposeGroup("");
      open("Add expense");
    }
  }, [composeGroup, group]);
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
        setGroupOpen(true);
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
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      {!user ? (
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            padding: 24,
            justifyContent: "center",
            backgroundColor: "white",
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{
              maxWidth: 400,
              width: "100%",
              alignSelf: "center",
              paddingVertical: 32,
            }}
          >
            <Text
              style={{
                fontSize: 34,
                color: C.green,
                fontWeight: "700",
                letterSpacing: -1,
                marginBottom: 12,
              }}
            >
              fairshare
            </Text>
            <Text style={{ fontSize: 18, color: C.ink, marginBottom: 30 }}>
              Split expenses with your people.
            </Text>
            <Card
              style={{ width: "100%", padding: 0, gap: 12, borderWidth: 0 }}
            >
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
              <Pills
                items={["Phone", "Email"]}
                value={authChannel}
                onChange={setAuthChannel}
              />
              {authChannel === "Phone" ? (
                <View style={{ gap: 16, marginTop: 16 }}>
                  <Text style={s.heading}>Welcome to Fairshare.</Text>
                  <PhoneAuth
                    available={phoneAvailable}
                    onComplete={finishPhoneAuth}
                  />
                  <Text style={s.muted}>
                    Already use email here? Sign in with email first, then link
                    your phone in Account to keep your groups.
                  </Text>
                  <Button
                    secondary
                    label="Sign in with email"
                    onPress={() => setAuthChannel("Email")}
                  />
                </View>
              ) : (
                <>
                  <Text style={s.heading}>
                    {authMode === "register"
                      ? "Create an account"
                      : "Welcome back"}
                  </Text>
                  <Text style={[s.muted, { marginBottom: 20 }]}>
                    {authMode === "register"
                      ? "Track shared expenses with your people."
                      : "Sign in to see your groups and balances."}
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
                      authMode === "register"
                        ? "new-password"
                        : "current-password"
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
                      setAuthMode(
                        authMode === "register" ? "login" : "register",
                      );
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
                </>
              )}
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
        <ExpenseHome
          user={user}
          groups={summaries}
          group={group}
          groupOpen={groupOpen}
          onSelect={selectGroup}
          onBack={() => setGroupOpen(false)}
          onOpen={open}
          onReview={review}
          notice={notice}
          error={!modal ? error : ""}
          onDismissNotice={() => setNotice("")}
          onCopyInvite={() =>
            void run(async () => {
              await copyText(peopleLink);
              setNotice("Invite link copied");
            })
          }
          onShareInvite={() =>
            void run(async () => {
              setNotice(await shareInvite(peopleLink, group.name));
            })
          }
          onRejectReceipt={(r: any) =>
            void run(async () => {
              await api(
                "/groups/" + selected + "/receipts/" + r.id + "/review",
                "POST",
                { action: "reject" },
              );
              await refresh();
              setNotice("Receipt rejected");
            })
          }
          onSignOut={() =>
            void run(async () => {
              await api("/auth/logout", "POST");
              await clearSession();
              setUser(null);
              setGroup(null);
              setGroups([]);
              setSummaries([]);
              setSelected("");
              setGroupOpen(false);
            })
          }
        />
      )}
      <Modal
        visible={!!modal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!busy) closeModal();
        }}
      >
        <SafeAreaView style={[s.overlay, !wide && { paddingVertical: 0 }]}>
          <View
            style={[
              s.modal,
              {
                maxHeight: wide ? "92%" : "100%",
                width: wide ? 540 : width,
                ...(!wide ? { height: "100%", borderRadius: 0 } : {}),
              },
            ]}
          >
            <View
              style={[
                s.between,
                {
                  paddingHorizontal: 20,
                  paddingVertical: 18,
                  borderBottomWidth: 1,
                  borderColor: C.line,
                  gap: 16,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close dialog"
                disabled={busy}
                onPress={closeModal}
              >
                {icon("x", 26, C.ink)}
              </Pressable>
              <Text
                style={[
                  s.heading,
                  { fontSize: 19, flex: 1, textAlign: "center" },
                ]}
              >
                {modal === "Add expense" ? "Add an expense" : modal}
              </Text>
              {isExpense || modal === "Record payment" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    modal === "Review receipt"
                      ? "Approve receipt"
                      : modal === "Record payment"
                        ? "Save payment"
                        : "Save expense"
                  }
                  disabled={busy}
                  onPress={() => void submit()}
                >
                  <Text
                    style={{ color: C.green, fontSize: 16, fontWeight: "600" }}
                  >
                    {busy
                      ? "Saving…"
                      : modal === "Review receipt"
                        ? "Approve"
                        : "Save"}
                  </Text>
                </Pressable>
              ) : (
                <View style={{ width: 26 }} />
              )}
            </View>
            <ScrollView
              contentContainerStyle={{ padding: 20, flexGrow: 1 }}
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
              {modal === "Account" && (
                <View style={{ gap: 16 }}>
                  <Text style={s.subtitle}>{user.name}</Text>
                  {!!user.email && (
                    <Text style={s.muted}>
                      Email sign-in remains available.
                    </Text>
                  )}
                  <Text style={s.muted}>
                    {user.phone_e164
                      ? "A verified phone number is linked. Verify another number below only if you want to replace it."
                      : "Link your phone to keep using this account and all its groups."}
                  </Text>
                  <PhoneAuth
                    link
                    available={phoneAvailable}
                    onComplete={finishPhoneAuth}
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
                <ExpenseEditor
                  form={form}
                  setForm={setForm}
                  group={group}
                  user={user}
                  image={image}
                  onPickImage={pickImage}
                  receipt={modal !== "Add expense"}
                  review={modal === "Review receipt"}
                />
              )}
              {modal === "Choose group" && (
                <View style={{ gap: 12 }}>
                  <Text style={s.muted}>Choose a group.</Text>
                  {summaries
                    .filter(
                      (g) => form.intent !== "people" || g.owner_id === user.id,
                    )
                    .map((g) => (
                      <Button
                        secondary
                        key={g.id}
                        label={g.name}
                        onPress={() =>
                          void run(async () => {
                            const people = form.intent === "people";
                            await selectGroup(g.id);
                            closeModal();
                            if (people) open("Add person");
                            else setComposeGroup(g.id);
                          })
                        }
                      />
                    ))}
                </View>
              )}
              {modal === "Expense details" && form.expense && (
                <View style={{ gap: 20 }}>
                  <View
                    style={{
                      alignSelf: "center",
                      backgroundColor: C.pale,
                      padding: 16,
                      borderRadius: 4,
                    }}
                  >
                    {icon("file-text", 34, C.green)}
                  </View>
                  <Text style={[s.heading, { textAlign: "center" }]}>
                    {form.expense.title}
                  </Text>
                  <Text
                    style={{ fontSize: 36, color: C.ink, textAlign: "center" }}
                  >
                    {money(form.expense.amount_minor, group.currency)}
                  </Text>
                  <Text style={[s.muted, { textAlign: "center" }]}>
                    {group.name} · {form.expense.spent_on.slice(0, 10)}
                  </Text>
                  <Text style={s.label}>
                    {memberName(form.expense.paid_by)} paid{" "}
                    {money(form.expense.amount_minor, group.currency)}
                  </Text>
                  {form.expense.splits.map((part: any) => (
                    <View key={part.memberId} style={s.between}>
                      <Text style={s.muted}>
                        {memberName(part.memberId)} owes
                      </Text>
                      <Text style={s.label}>
                        {money(part.amountMinor, group.currency)}
                      </Text>
                    </View>
                  ))}
                  <Button
                    secondary
                    label="Remove expense"
                    onPress={() =>
                      open("Remove expense", {
                        id: form.expense.id,
                        title: form.expense.title,
                      })
                    }
                  />
                </View>
              )}
              {modal === "Record payment" && (
                <View style={{ gap: 22, paddingTop: 24 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 24,
                    }}
                  >
                    <View
                      style={[
                        s.avatar,
                        { width: 72, height: 72, borderRadius: 36 },
                      ]}
                    >
                      <Text style={{ fontSize: 28, color: C.green }}>
                        {memberName(form.from).slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    {icon("arrow-right", 28, C.muted)}
                    <View
                      style={[
                        s.avatar,
                        { width: 72, height: 72, borderRadius: 36 },
                      ]}
                    >
                      <Text style={{ fontSize: 28, color: C.green }}>
                        {memberName(form.to).slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={{ textAlign: "center", fontSize: 18, color: C.ink }}
                  >
                    {memberName(form.from)} paid {memberName(form.to)}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      alignSelf: "center",
                      gap: 14,
                    }}
                  >
                    <Text style={{ fontSize: 20, color: C.muted }}>
                      {group.currency}
                    </Text>
                    <TextInput
                      accessibilityLabel={`Amount (${group.currency})`}
                      value={form.amount}
                      onChangeText={(v) => set("amount", v)}
                      keyboardType="decimal-pad"
                      style={{
                        fontSize: 36,
                        borderBottomWidth: 2,
                        borderColor: C.green,
                        color: C.ink,
                        width: 160,
                        paddingVertical: 10,
                        textAlign: "center",
                      }}
                    />
                  </View>
                  <Button
                    secondary
                    small
                    label="Change people"
                    onPress={() => set("changePeople", !form.changePeople)}
                  />
                  {form.changePeople && (
                    <>
                      <Text style={s.label}>From</Text>
                      <Pills
                        items={group.members}
                        value={form.from}
                        onChange={(v: string) => set("from", v)}
                      />
                      <Text style={s.label}>To</Text>
                      <Pills
                        items={group.members}
                        value={form.to}
                        onChange={(v: string) => set("to", v)}
                      />
                    </>
                  )}
                  <Field
                    label="Note (optional)"
                    value={form.note || ""}
                    onChangeText={(v: string) => set("note", v)}
                    placeholder="Cash, bank transfer…"
                  />
                  <Text style={[s.muted, { lineHeight: 22 }]}>
                    Record money that has already changed hands. Fairshare does
                    not send a payment.
                  </Text>
                </View>
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
              {!isExpense &&
                !["Choose group", "Expense details", "Record payment"].includes(
                  modal,
                ) &&
                !form.agentId &&
                modal !== "Account" &&
                modal !== "Invitation link" && (
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
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
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
    backgroundColor: "rgba(30,40,40,0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  modal: { backgroundColor: C.paper, borderRadius: 8, overflow: "hidden" },
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

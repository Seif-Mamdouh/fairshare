import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { expenseFromForm } from "./expense-form";
import { api } from "./api";
import { Button, C, Pills, icon } from "./components";
import { sans } from "./design";

/** Bank descriptors often arrive in capitals; show them in sentence case. */
const shortDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
const tidy = (raw: string) => {
  const name = raw.replace(/[\s*\/#-]+$/, "").trim();
  if (/[a-z]/.test(name) || name.length <= 4) return name;
  return name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
};
import { PlaidConnect } from "./PlaidConnect";
import { ExpenseEditor } from "./ExpenseEditor";
import { equalSplit, parseMoney, money, expenseSchema } from "../shared/domain";
export function Banking({ user, groups, onImported }: any) {
  const [state, setState] = useState<any>(null),
    [transactions, setTransactions] = useState<any[]>([]),
    [next, setNext] = useState<number | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [consent, setConsent] = useState(false),
    [disconnect, setDisconnect] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [review, setReview] = useState<any>(null),
    [group, setGroup] = useState<any>(null),
    [form, setForm] = useState<any>({});
  async function reload() {
    const [s, t] = await Promise.all([api("/bank"), api("/bank/transactions")]);
    setState(s);
    setTransactions(t.transactions);
    setNext(t.nextOffset);
  }
  async function run(fn: () => Promise<void>) {
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
    void run(reload);
  }, []);
  async function selectGroup(gid: string, t = review) {
    const g = await api("/groups/" + gid);
    setGroup(g);
    setForm({
      title: t.name,
      amount: (t.amount_minor / 100).toFixed(2),
      paidBy: g.members.find((m: any) => m.user_id === user.id)?.id,
      spentOn: t.spent_on,
      category: "Other",
      audience: "Whole group",
      participants: g.members.map((m: any) => m.id),
      splitMode: "Equal",
      exact: {},
    });
  }
  async function importExpense() {
    const expense = expenseFromForm(form);
    await api("/bank/transactions/" + review.id + "/import", "POST", {
      groupId: group.id,
      revision: review.revision,
      expense,
    });
    setReview(null);
    setGroup(null);
    setNotice(
      "Purchase added to the group. Your bank connection and other transactions remain private.",
    );
    await reload();
    await onImported();
  }
  if (!state)
    return (
      <View style={{ gap: 14 }}>
        <Text>{error || "Loading your private bank connections…"}</Text>
        {!!error && <Button label="Retry" onPress={() => void run(reload)} />}
      </View>
    );
  if (review)
    return (
      <View style={{ gap: 18 }}>
        <Button
          secondary
          label="Back to private transactions"
          disabled={busy}
          onPress={() => {
            setReview(null);
            setGroup(null);
            setError("");
          }}
        />
        <Text style={{ fontWeight: "700", fontSize: 20 }}>
          Review before sharing
        </Text>
        <Text style={{ color: C.muted }}>
          Only the expense you save below will be visible to this group. The
          bank account and original transaction stay private. Review the title,
          payer and participants.
        </Text>
        <Text>Choose a {review.currency} group</Text>
        <Pills
          items={groups.filter((g: any) => g.currency === review.currency)}
          value={group?.id}
          onChange={(gid: string) => void run(() => selectGroup(gid))}
        />
        {!groups.some((g: any) => g.currency === review.currency) && (
          <Text>
            Create a group in this currency first, then return to this purchase.
          </Text>
        )}
        {!!group && (
          <>
            <ExpenseEditor
              form={form}
              setForm={setForm}
              group={group}
              user={user}
              lockedAmount
            />
            <Text style={{ color: C.muted }}>
              The imported total stays equal to the posted bank purchase. Saving
              does not send money.
            </Text>
            <Button
              label={busy ? "Saving…" : "Share as group expense"}
              disabled={busy}
              onPress={() => void run(importExpense)}
            />
          </>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={{ color: C.red }}>
            {error}
          </Text>
        )}
      </View>
    );
  return (
    <View style={{ gap: 18 }}>
      <Text style={{ color: C.muted, lineHeight: 22 }}>
        Only you see these. Pick a purchase to split it with a group; nothing
        else is shared, and Fairshare never moves money.
      </Text>
      {state.links.length && !adding ? null : !state.configured ? (
        <Text accessibilityRole="alert">
          Bank connections are not enabled yet. The app owner needs to finish
          Plaid setup. You can continue adding expenses manually.
        </Text>
      ) : (
        <>
          {state.environment === "sandbox" && (
            <Text style={{ color: C.ink, fontWeight: "600" }}>
              Sandbox mode: test banks only. This does not connect a real bank.
            </Text>
          )}
          {!state.platforms[Platform.OS] && (
            <Text>Bank linking is not configured for this platform yet.</Text>
          )}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="I understand private bank account access"
            accessibilityState={{ checked: consent }}
            onPress={() => setConsent(!consent)}
            style={{
              padding: 14,
              borderWidth: 1,
              borderColor: C.line,
              borderRadius: 0,
            }}
          >
            <Text>
              {consent ? "☑" : "☐"} This bank connection belongs to my private
              account. Only purchases I explicitly share become group expenses.
            </Text>
          </Pressable>
          <PlaidConnect
            disabled={!consent || busy || !state.platforms[Platform.OS]}
            start={(platform: string) =>
              api("/bank/link-token", "POST", { platform, consent })
            }
            complete={async (publicToken: string, id: string) => {
              const link = await api("/bank/link/" + id + "/complete", "POST", {
                publicToken,
              });
              await reload();
              setNotice(
                "Bank connected. Use Sync transactions to retrieve available purchases.",
              );
            }}
          />
        </>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: C.red }}>
          {error}
        </Text>
      )}
      {!!notice && <Text style={{ color: C.green }}>{notice}</Text>}
      {state.links.map((link: any) => (
        <View
          key={link.id}
          style={{
            paddingVertical: 14,
            borderTopWidth: 1,
            borderColor: C.rule,
            gap: 8,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "600", color: C.ink }}>
            {link.environment === "sandbox" ? "Test bank" : "Your bank"}
          </Text>
          <Text style={{ color: C.muted, lineHeight: 21 }}>
            {(() => {
              const names = state.accounts
                .filter((a: any) => a.link_id === link.id)
                .map((a: any) => a.name.replace(/^Plaid /, ""));
              if (!names.length)
                return "Sync to retrieve your accounts and transactions.";
              return names.length <= 2
                ? names.join(" and ")
                : `${names.length} accounts, including ${names[0]} and ${names[1]}`;
            })()}
          </Text>
          <Text style={{ color: C.muted }}>
            {link.last_synced_at
              ? "Last synced " +
                new Date(link.last_synced_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "Not synced yet"}
            .
          </Text>
          {link.status !== "connected" && (
            <Text style={{ color: C.red }}>
              {link.status === "disconnecting"
                ? "Disconnection is pending. Retry below; imports are paused."
                : "This connection needs attention. Disconnect it, then connect again through Plaid."}
            </Text>
          )}
          {link.status === "connected" && (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              {!adding && state.configured && (
                <Button
                  small
                  secondary
                  label="Connect another bank"
                  onPress={() => setAdding(true)}
                />
              )}
              <Button
                small
                secondary
                label={busy ? "Working…" : "Sync transactions"}
                disabled={busy || !state.configured}
                onPress={() =>
                  void run(async () => {
                    try {
                      await api("/bank/links/" + link.id + "/sync", "POST", {});
                    } finally {
                      await reload();
                    }
                    setNotice(
                      "Available transactions updated. Nothing was shared.",
                    );
                  })
                }
              />
            </View>
          )}
          {disconnect === link.id ? (
            <>
              <Text>
                Revoke this bank connection and delete its private accounts and
                transactions? Expenses you already shared remain in their
                groups.
              </Text>
              <Button
                label="Disconnect and delete bank data"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    try {
                      await api("/bank/links/" + link.id, "DELETE");
                      setDisconnect(null);
                      setNotice(
                        "Bank disconnected. Private bank data removed; saved expenses preserved.",
                      );
                    } finally {
                      await reload();
                    }
                  })
                }
              />
              <Button
                secondary
                label="Keep connection"
                onPress={() => setDisconnect(null)}
              />
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Disconnect bank"
              disabled={busy || !state.configured}
              onPress={() => setDisconnect(link.id)}
              style={{
                alignSelf: "flex-end",
                marginTop: -43,
                paddingVertical: 6,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: C.red,
                  textDecorationLine: "underline",
                }}
              >
                Disconnect this bank
              </Text>
            </Pressable>
          )}
        </View>
      ))}
      <Text
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: C.muted,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderColor: C.rule,
          marginBottom: -18,
        }}
      >
        Transactions
      </Text>
      {!transactions.length && (
        <Text style={{ color: C.muted }}>
          No transactions to show. Connect and sync a bank, then check back if
          it is still preparing your history.
        </Text>
      )}
      {transactions
        .filter((t) => !/payment|transfer|deposit|credit/i.test(t.name))
        .map((t) => {
          const account = state.accounts.find(
            (a: any) => a.id === t.account_id,
          );
          const canShare =
            !t.pending &&
            !t.imported_expense_id &&
            t.amount_minor > 0 &&
            t.amount_minor <= 100000000 &&
            t.currency &&
            !/payment|transfer|deposit|credit/i.test(t.name);
          return (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityLabel="Review purchase to split"
              disabled={busy || !canShare}
              onPress={() => {
                setError("");
                setReview(t);
                setGroup(null);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                minHeight: 62,
                borderBottomWidth: 1,
                borderColor: C.line,
              }}
            >
              <Text style={{ width: 56, fontSize: 14, color: C.muted }}>
                {shortDate(t.spent_on)}
              </Text>
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: canShare ? C.ink : C.muted,
                  }}
                >
                  {tidy(t.name)}
                </Text>
                <Text style={{ fontSize: 13, color: C.muted }}>
                  {(account?.name || "Bank account").replace(/^Plaid /, "")}
                  {t.pending
                    ? ", pending"
                    : t.imported_expense_id
                      ? ", already split"
                      : t.amount_minor < 0
                        ? ", money in"
                        : !canShare
                          ? ", nothing to split"
                          : ""}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: sans,
                  fontVariant: ["tabular-nums"],
                  fontSize: 16,
                  fontWeight: "600",
                  color:
                    t.amount_minor < 0 ? C.green : canShare ? C.ink : C.muted,
                }}
              >
                {t.currency
                  ? (t.amount_minor < 0 ? "+" : "") +
                    money(Math.abs(t.amount_minor), t.currency)
                  : "Unsupported currency"}
              </Text>
              <View style={{ width: 18 }}>
                {canShare && icon("chevron-right", 18, C.muted)}
              </View>
            </Pressable>
          );
        })}
      {next !== null && (
        <Button
          secondary
          label="Load more transactions"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              const t = await api("/bank/transactions?offset=" + next);
              setTransactions((prev) => [
                ...prev,
                ...t.transactions.filter(
                  (x: any) => !prev.some((p) => p.id === x.id),
                ),
              ]);
              setNext(t.nextOffset);
            })
          }
        />
      )}
    </View>
  );
}

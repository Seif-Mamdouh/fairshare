import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { api } from "./api";
import { Button, C, Pills } from "./components";
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
    const expense = expenseSchema.parse({
      title: form.title,
      amountMinor: parseMoney(form.amount),
      paidBy: form.paidBy,
      spentOn: form.spentOn,
      category: form.category,
      splits:
        form.splitMode === "Equal"
          ? equalSplit(parseMoney(form.amount), form.participants)
          : form.participants.map((memberId: string) => ({
              memberId,
              amountMinor: parseMoney(form.exact[memberId] || "0", true),
            })),
    });
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
      <Text style={{ fontWeight: "700", fontSize: 20 }}>
        Your private bank transactions
      </Text>
      <Text style={{ color: C.muted, lineHeight: 22 }}>
        Connect a US bank through Plaid, review purchases, then choose what to
        split. Group members and agents cannot see your bank accounts or
        transaction list. Fairshare does not move money.
      </Text>
      {!state.configured ? (
        <Text accessibilityRole="alert">
          Bank connections are not enabled yet. The app owner needs to finish
          Plaid setup. You can continue adding expenses manually.
        </Text>
      ) : (
        <>
          {state.environment === "sandbox" && (
            <Text style={{ color: C.red, fontWeight: "700" }}>
              SANDBOX — test institutions only. This does not connect a real
              bank.
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
              borderRadius: 8,
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
            padding: 16,
            borderWidth: 1,
            borderColor: C.line,
            borderRadius: 10,
            gap: 12,
          }}
        >
          <Text style={{ fontWeight: "700" }}>
            Bank connection{link.environment === "sandbox" ? " · Sandbox" : ""}
          </Text>
          {state.accounts
            .filter((a: any) => a.link_id === link.id)
            .map((a: any) => (
              <Text key={a.id}>
                {a.name}
                {a.mask ? " · ••" + a.mask : ""}
              </Text>
            ))}
          {!state.accounts.some((a: any) => a.link_id === link.id) && (
            <Text>
              Sync to retrieve your selected accounts and available
              transactions.
            </Text>
          )}
          <Text style={{ color: C.muted }}>
            {link.last_synced_at
              ? "Last synced " + new Date(link.last_synced_at).toLocaleString()
              : "Not synced yet"}
            . Bank data may be delayed; syncing checks data already available
            from Plaid.
          </Text>
          {link.status !== "connected" && (
            <Text style={{ color: C.red }}>
              {link.status === "disconnecting"
                ? "Disconnection is pending. Retry below; imports are paused."
                : "This connection needs attention. Disconnect it, then connect again through Plaid."}
            </Text>
          )}
          {link.status === "connected" && (
            <Button
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
            <Button
              secondary
              label="Disconnect bank"
              disabled={busy || !state.configured}
              onPress={() => setDisconnect(link.id)}
            />
          )}
        </View>
      ))}
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Transactions</Text>
      {!transactions.length && (
        <Text style={{ color: C.muted }}>
          No transactions to show. Connect and sync a bank, then check back if
          it is still preparing your history.
        </Text>
      )}
      {transactions.map((t) => {
        const account = state.accounts.find((a: any) => a.id === t.account_id);
        const canShare =
          !t.pending &&
          !t.imported_expense_id &&
          t.amount_minor > 0 &&
          t.amount_minor <= 100000000 &&
          t.currency;
        return (
          <View
            key={t.id}
            style={{
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderColor: C.line,
              gap: 8,
            }}
          >
            <Text style={{ fontWeight: "600" }}>{t.name}</Text>
            <Text>
              {t.spent_on} ·{" "}
              {t.currency
                ? money(Math.abs(t.amount_minor), t.currency)
                : "Unsupported currency"}
              {t.amount_minor < 0 ? " credit" : ""}
            </Text>
            <Text style={{ color: C.muted }}>
              {account?.name || "Bank account"}
              {t.pending
                ? " · Pending"
                : t.imported_expense_id
                  ? " · Already shared"
                  : " · Posted"}
            </Text>
            {canShare && (
              <Button
                small
                secondary
                label="Review purchase to split"
                disabled={busy}
                onPress={() => {
                  setError("");
                  setReview(t);
                  setGroup(null);
                }}
              />
            )}
          </View>
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

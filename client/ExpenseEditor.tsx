import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
} from "react-native";
import { C, icon, Button, Field, Pills } from "./components";
import {
  weightedSplit,
  equalSplit,
  parseMoney,
  money,
  categories,
} from "../shared/domain";
import { display } from "./design";
import { ExpenseTools } from "./ExpenseTools";
export function ExpenseEditor({
  form,
  setForm,
  group,
  user,
  image,
  onPickImage,
  receipt = false,
  review = false,
  lockedAmount = false,
  onDefaultsChanged,
}: any) {
  const [page, setPage] = useState("main");
  const set = (key: string, value: any) =>
    setForm((f: any) => ({ ...f, [key]: value }));
  const myId = group.members.find((m: any) => m.user_id === user.id)?.id;
  const payer =
    form.paidBy === myId
      ? "you"
      : group.members.find((m: any) => m.id === form.paidBy)?.name ||
        "a person";
  let shares: Record<string, number> = {};
  try {
    shares = Object.fromEntries(
      (form.splitMode === "Saved proportions"
        ? weightedSplit(
            parseMoney(form.amount),
            form.participants.map((memberId: string) => ({
              memberId,
              weight:
                form.defaultWeights?.find((w: any) => w.memberId === memberId)
                  ?.weight || 1,
            })),
          )
        : equalSplit(parseMoney(form.amount), form.participants)
      ).map((p) => [p.memberId, p.amountMinor]),
    );
  } catch {}
  if (page === "split")
    return (
      <View style={{ gap: 16 }}>
        <View style={s.between}>
          <Text style={s.title}>Paid by & split</Text>
          <Button
            small
            secondary
            label="Done"
            onPress={() => setPage("main")}
          />
        </View>
        <Text style={s.label}>Who paid?</Text>
        <Pills
          items={group.members}
          value={form.paidBy}
          onChange={(v: string) => set("paidBy", v)}
        />
        <Text style={s.label}>Split options</Text>
        <Pills
          items={
            form.defaultWeights
              ? ["Equal", "Exact", "Saved proportions"]
              : ["Equal", "Exact"]
          }
          value={form.splitMode}
          onChange={(v: string) => set("splitMode", v)}
        />
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
        <Text style={s.muted}>
          {form.participants.length} people included.{" "}
          {form.splitMode === "Exact"
            ? "Enter each person’s exact share."
            : "Each selected person pays an equal share."}
        </Text>
        <View style={s.row}>
          <Button
            small
            secondary
            label="Select all"
            onPress={() =>
              set(
                "participants",
                group.members.map((m: any) => m.id),
              )
            }
          />
          <Button
            small
            secondary
            label="Clear selection"
            onPress={() => set("participants", [])}
          />
        </View>
        {group.members.map((m: any) => (
          <View key={m.id} style={s.member}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={`Include ${m.name}`}
              accessibilityState={{ checked: form.participants.includes(m.id) }}
              onPress={() =>
                setForm((f: any) => ({
                  ...f,
                  audience: "Selected people",
                  participants: f.participants.includes(m.id)
                    ? f.participants.filter((id: string) => id !== m.id)
                    : [...f.participants, m.id],
                }))
              }
              style={[s.row, { flex: 1 }]}
            >
              {icon(
                form.participants.includes(m.id) ? "check-square" : "square",
                23,
                C.green,
              )}
              <View style={s.avatar}>
                <Text>{m.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <Text style={s.person}>{m.id === myId ? "You" : m.name}</Text>
            </Pressable>
            {form.participants.includes(m.id) &&
              (form.splitMode === "Exact" ? (
                <TextInput
                  accessibilityLabel={`Share for ${m.name}`}
                  value={form.exact?.[m.id] || ""}
                  onChangeText={(v) =>
                    set("exact", { ...form.exact, [m.id]: v })
                  }
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  style={s.exact}
                />
              ) : (
                <Text style={s.person}>
                  {shares[m.id] === undefined
                    ? "—"
                    : money(shares[m.id], group.currency)}
                </Text>
              ))}
          </View>
        ))}
        <Text style={s.muted}>
          The payer can be different from the people sharing this expense.
        </Text>
      </View>
    );
  if (page === "details")
    return (
      <View style={{ gap: 18 }}>
        <View style={s.between}>
          <Text style={s.title}>Expense details</Text>
          <Button
            small
            secondary
            label="Done"
            onPress={() => setPage("main")}
          />
        </View>
        <Field
          label="Date (YYYY-MM-DD)"
          value={form.spentOn}
          onChangeText={(v: string) => set("spentOn", v)}
        />
        <Text style={s.label}>Category</Text>
        <Pills
          items={[...categories]}
          value={form.category}
          onChange={(v: string) => set("category", v)}
        />
        {receipt && (
          <Field
            label="Receipt notes"
            value={form.notes || ""}
            onChangeText={(v: string) => set("notes", v)}
          />
        )}
      </View>
    );
  return (
    <View style={{ minHeight: 430, flex: 1 }}>
      {review && (
        <Text style={s.review}>
          Receipt from {form.source}. Check the details before approving.
        </Text>
      )}
      <View style={s.form}>
        <Text style={s.fieldLabel}>What was it for?</Text>
        <TextInput
          accessibilityLabel="What was it for?"
          placeholder="Enter a description"
          placeholderTextColor={C.muted}
          value={form.title}
          onChangeText={(v) => set("title", v)}
          style={s.description}
        />
        <Text style={[s.fieldLabel, { marginTop: 22 }]}>
          Amount in {group.currency}
        </Text>
        <View style={s.amountRow}>
          <Text style={s.amountSign}>
            {group.currency === "USD"
              ? "$"
              : group.currency === "EUR"
                ? "€"
                : group.currency === "GBP"
                  ? "£"
                  : group.currency}
          </Text>
          <TextInput
            accessibilityLabel={`Amount (${group.currency})`}
            editable={!lockedAmount}
            placeholder="0.00"
            placeholderTextColor={C.rule}
            value={form.amount}
            onChangeText={(v) =>
              setForm((f: any) => ({
                ...f,
                amount: v,
                conversion: undefined,
                itemization: undefined,
              }))
            }
            keyboardType="decimal-pad"
            style={s.amount}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose payer and split"
          onPress={() => setPage("split")}
          style={s.choice}
        >
          <Text style={s.choiceText}>
            Paid by <Text style={s.strong}>{payer}</Text>, split{" "}
            <Text style={s.strong}>
              {form.splitMode === "Equal"
                ? "equally"
                : form.splitMode === "Saved proportions"
                  ? "by saved proportions"
                  : "by exact amounts"}
            </Text>
          </Text>
          {icon("chevron-right", 18, C.muted)}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose people sharing this expense"
          onPress={() => setPage("split")}
          style={s.choice}
        >
          <Text style={s.choiceText}>
            Between{" "}
            <Text style={s.strong}>
              {form.audience === "Whole group"
                ? "everyone in " + group.name
                : `${form.participants.length} selected people`}
            </Text>{" "}
            ({form.participants.length}{" "}
            {form.participants.length === 1 ? "person" : "people"})
          </Text>
          {icon("chevron-right", 18, C.muted)}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change date and category"
          onPress={() => setPage("details")}
          style={s.choice}
        >
          <Text style={s.choiceText}>
            On <Text style={s.strong}>{prettyDate(form.spentOn)}</Text>, filed
            under <Text style={s.strong}>{form.category}</Text>
          </Text>
          {icon("chevron-right", 18, C.muted)}
        </Pressable>
      </View>
      {image && (
        <Image
          source={{ uri: image }}
          style={{
            height: 140,
            width: "100%",
            resizeMode: "contain",
            marginVertical: 16,
          }}
        />
      )}
      {!receipt && (
        <ExpenseTools
          form={form}
          setForm={setForm}
          group={group}
          lockedAmount={lockedAmount}
          onDefaultsChanged={onDefaultsChanged}
        />
      )}
      {receipt && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach receipt image"
          onPress={onPickImage}
          style={[s.choice, { marginHorizontal: 20 }]}
        >
          <Text style={s.choiceText}>Receipt photo</Text>
          <Text style={s.change}>Attach</Text>
        </Pressable>
      )}
    </View>
  );
}
const prettyDate = (iso: string) => {
  const d = new Date(iso + "T12:00:00");
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};
const s = StyleSheet.create({
  form: { paddingTop: 8, paddingBottom: 8 },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: C.muted,
    marginBottom: 6,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
    borderBottomWidth: 1,
    borderColor: C.rule,
    marginBottom: 22,
  },
  amountSign: {
    fontFamily: display,
    fontSize: 44,
    fontWeight: "600",
    color: C.ink,
  },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  choiceText: { flex: 1, fontSize: 16, lineHeight: 22, color: C.ink },
  strong: { fontWeight: "600" },
  change: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
    textDecorationLine: "underline",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 20, color: C.ink },
  label: { fontSize: 15, fontWeight: "600", color: C.ink },
  muted: { fontSize: 13, color: C.muted, lineHeight: 20 },
  person: { fontSize: 16, color: C.ink },
  member: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: C.line,
    paddingVertical: 14,
    gap: 14,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 0,
    backgroundColor: "#E5ECE9",
    alignItems: "center",
    justifyContent: "center",
  },
  exact: {
    borderBottomWidth: 1,
    borderColor: C.green,
    width: 84,
    textAlign: "right",
    fontSize: 17,
    padding: 8,
    color: C.ink,
  },
  withRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderColor: C.line,
    paddingVertical: 12,
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  groupChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: C.line,
    paddingVertical: 7,
    paddingHorizontal: 10,
    flexShrink: 1,
  },
  entry: {
    maxWidth: 390,
    width: "100%",
    alignSelf: "center",
    paddingTop: 52,
    gap: 16,
  },
  entryIcon: {
    width: 48,
    height: 48,
    backgroundColor: "#FAFAFA",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  description: {
    fontSize: 20,
    color: C.ink,
    paddingVertical: 8,
    borderBottomWidth: 1.5,
    borderColor: C.rule,
  },
  amount: {
    flex: 1,
    minWidth: 0,
    fontFamily: display,
    fontSize: 44,
    fontWeight: "600",
    letterSpacing: -1,
    color: C.ink,
    paddingVertical: 4,
  },
  splitButton: {
    alignSelf: "center",
    borderWidth: 1,
    borderColor: "#D7DADA",
    borderBottomWidth: 2,
    borderRadius: 0,
    padding: 11,
    marginTop: 16,
  },
  bottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: C.line,
    gap: 12,
    paddingTop: 15,
    flexWrap: "wrap",
  },
  review: {
    color: C.green,
    backgroundColor: C.pale,
    padding: 12,
    lineHeight: 20,
  },
});

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
import { equalSplit, parseMoney, money, categories } from "../shared/domain";
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
      equalSplit(parseMoney(form.amount), form.participants).map((p) => [
        p.memberId,
        p.amountMinor,
      ]),
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
          items={["Equal", "Exact"]}
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose people sharing this expense"
        onPress={() => setPage("split")}
        style={s.withRow}
      >
        <Text style={s.person}>With you and:</Text>
        <View style={s.groupChip}>
          {icon("users", 17, C.green)}
          <Text numberOfLines={1} style={{ color: C.ink, flexShrink: 1 }}>
            {group.name}
          </Text>
        </View>
      </Pressable>
      <View style={s.entry}>
        <View style={s.row}>
          <View style={[s.entryIcon, { backgroundColor: "#DCEADF" }]}>
            {icon("file-text", 28)}
          </View>
          <TextInput
            accessibilityLabel="What was it for?"
            placeholder="Enter a description"
            placeholderTextColor="#969A9B"
            value={form.title}
            onChangeText={(v) => set("title", v)}
            style={s.description}
          />
        </View>
        <View style={s.row}>
          <View style={s.entryIcon}>
            <Text style={{ fontSize: 26, fontWeight: "600" }}>
              {group.currency === "USD" ? "$" : group.currency}
            </Text>
          </View>
          <TextInput
            accessibilityLabel={`Amount (${group.currency})`}
            editable={!lockedAmount}
            placeholder="0.00"
            placeholderTextColor="#969A9B"
            value={form.amount}
            onChangeText={(v) => set("amount", v)}
            keyboardType="decimal-pad"
            style={s.amount}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose payer and split"
          onPress={() => setPage("split")}
          style={s.splitButton}
        >
          <Text style={{ fontSize: 16, color: C.ink, textAlign: "center" }}>
            Paid by <Text style={{ fontWeight: "600" }}>{payer}</Text> and split{" "}
            <Text style={{ fontWeight: "600" }}>
              {form.splitMode === "Equal" ? "equally" : "by exact amounts"}
            </Text>
          </Text>
        </Pressable>
        <Text style={[s.muted, { textAlign: "center", marginTop: 10 }]}>
          {form.audience === "Whole group"
            ? "Whole group"
            : `${form.participants.length} selected people`}{" "}
          · {form.participants.length} people
        </Text>
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
      <View style={{ flex: 1, minHeight: 70 }} />
      <View style={s.bottom}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change date and category"
          onPress={() => setPage("details")}
          style={s.row}
        >
          {icon("calendar", 22, "#587181")}
          <Text style={s.muted}>{form.spentOn}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change expense category"
          onPress={() => setPage("details")}
          style={s.row}
        >
          {icon("tag", 21, C.red)}
          <Text style={s.muted}>{form.category}</Text>
        </Pressable>
        {receipt && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Attach receipt image"
            onPress={onPickImage}
          >
            {icon("camera", 24, "#9574AC")}
          </Pressable>
        )}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
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
    borderRadius: 16,
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
    borderRadius: 20,
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
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  description: {
    minWidth: 0,
    width: 0,
    fontSize: 22,
    color: C.ink,
    borderBottomWidth: 1,
    borderColor: "#636868",
    flex: 1,
    paddingVertical: 10,
  },
  amount: {
    minWidth: 0,
    width: 0,
    fontSize: 34,
    fontWeight: "600",
    color: C.ink,
    borderBottomWidth: 2,
    borderColor: C.green,
    flex: 1,
    paddingVertical: 6,
  },
  splitButton: {
    alignSelf: "center",
    borderWidth: 1,
    borderColor: "#D7DADA",
    borderBottomWidth: 2,
    borderRadius: 4,
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

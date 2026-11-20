import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Button, Field, Pills, C } from "./components";
import { sans, display } from "./design";
import { money, parseMoney, categories } from "../shared/domain";
import { filterExpenses, spendingSummary } from "../shared/insights";
const head = {
  fontSize: 15,
  fontWeight: "600" as const,
  color: C.ink,
  paddingBottom: 10,
  borderBottomWidth: 1,
  borderColor: C.rule,
};
const figure = {
  fontFamily: sans,
  fontSize: 16,
  fontWeight: "600" as const,
  fontVariant: ["tabular-nums" as const],
  color: C.ink,
};
/** Each row's bar is its part of the whole, so the bars add up to the total. */
function Bars({ title, rows, currency }: any) {
  const total = Math.max(
    1,
    rows.reduce((n: number, r: any) => n + r[1], 0),
  );
  return (
    <View>
      <Text style={head}>{title}</Text>
      {rows.map(([label, amount]: [string, number]) => (
        <View
          key={label}
          accessibilityLabel={`${label}: ${money(amount, currency)}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 16,
            minHeight: 52,
            borderBottomWidth: 1,
            borderColor: C.line,
          }}
        >
          <Text style={{ width: 150, fontSize: 16, fontWeight: "500" }}>
            {label}
          </Text>
          <View style={{ flex: 1, height: 8, backgroundColor: C.pale }}>
            <View
              style={{
                height: 8,
                width: `${(amount / total) * 100}%`,
                backgroundColor: C.green,
              }}
            />
          </View>
          <Text
            style={{
              width: 44,
              fontSize: 14,
              color: C.muted,
              textAlign: "right",
            }}
          >
            {Math.round((amount / total) * 100)}%
          </Text>
          <Text style={[figure, { width: 104, textAlign: "right" }]}>
            {money(amount, currency)}
          </Text>
        </View>
      ))}
    </View>
  );
}
/** Who fronted the money against what each person actually owes for. */
function People({ group, rows }: any) {
  const people = group.members
    .map((m: any) => ({
      name: m.name,
      paid: rows
        .filter((e: any) => e.paid_by === m.id)
        .reduce((n: number, e: any) => n + e.amount_minor, 0),
      share: rows.reduce(
        (n: number, e: any) =>
          n +
          ((e.splits || []).find((x: any) => x.memberId === m.id)
            ?.amountMinor || 0),
        0,
      ),
    }))
    .sort((a: any, b: any) => b.paid - a.paid);
  const cell = { width: 120, textAlign: "right" as const };
  return (
    <View>
      <View style={{ flexDirection: "row", ...head }}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: "600" }}>
          By person
        </Text>
        <Text style={[cell, { fontSize: 14, color: C.muted }]}>Paid</Text>
        <Text style={[cell, { fontSize: 14, color: C.muted }]}>
          Their share
        </Text>
        <Text style={[cell, { fontSize: 14, color: C.muted }]}>Difference</Text>
      </View>
      {people.map((p: any) => (
        <View
          key={p.name}
          style={{
            flexDirection: "row",
            alignItems: "center",
            minHeight: 52,
            borderBottomWidth: 1,
            borderColor: C.line,
          }}
        >
          <Text style={{ flex: 1, fontSize: 16, fontWeight: "500" }}>
            {p.name}
          </Text>
          <Text style={[figure, cell, { fontWeight: "400" }]}>
            {money(p.paid, group.currency)}
          </Text>
          <Text style={[figure, cell, { fontWeight: "400" }]}>
            {money(p.share, group.currency)}
          </Text>
          <Text
            style={[
              figure,
              cell,
              { color: p.paid - p.share > 0 ? C.green : C.ink },
            ]}
          >
            {p.paid - p.share > 0 ? "+" : p.paid - p.share < 0 ? "−" : ""}
            {money(Math.abs(p.paid - p.share), group.currency)}
          </Text>
        </View>
      ))}
    </View>
  );
}
export function ExpenseCharts({ group }: any) {
  const [period, setPeriod] = useState("All time");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const rows = filterExpenses(group.expenses, group.members, { from, to }),
    summary = spendingSummary(rows);
  return (
    <View style={{ gap: 36 }}>
      <View>
        <Text style={{ fontSize: 15, color: C.muted }}>
          {summary.count} {summary.count === 1 ? "expense" : "expenses"}
          {period === "All time" ? " so far" : ", " + period.toLowerCase()}, in{" "}
          {group.currency}
        </Text>
        <Text
          style={{
            fontFamily: display,
            fontSize: 40,
            lineHeight: 48,
            fontWeight: "500",
            letterSpacing: -1.4,
            color: C.ink,
            fontVariant: ["tabular-nums"],
          }}
        >
          {money(summary.total, group.currency)}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 24 }}>
        {["All time", "This month", "Last month", "This year"].map((v) => (
          <Pressable
            key={v}
            accessibilityRole="button"
            accessibilityState={{ selected: period === v }}
            onPress={() => {
              const now = new Date(),
                iso = (d: Date) =>
                  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              setPeriod(v);
              if (v === "All time") {
                setFrom("");
                setTo("");
              } else if (v === "This month") {
                setFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
                setTo(iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
              } else if (v === "Last month") {
                setFrom(
                  iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
                );
                setTo(iso(new Date(now.getFullYear(), now.getMonth(), 0)));
              } else {
                setFrom(iso(new Date(now.getFullYear(), 0, 1)));
                setTo(iso(new Date(now.getFullYear(), 11, 31)));
              }
            }}
            style={{
              paddingVertical: 4,
              borderBottomWidth: 1,
              borderColor: period === v ? C.ink : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: "500",
                color: period === v ? C.ink : C.muted,
              }}
            >
              {v}
            </Text>
          </Pressable>
        ))}
      </View>
      {!summary.count ? (
        <Text>No spending to chart yet.</Text>
      ) : (
        <>
          <Bars
            title="By category"
            rows={summary.categories}
            currency={group.currency}
          />
          {summary.months.length > 1 && (
            <Bars
              title="By month"
              rows={summary.months.map(([m, n]: any) => [
                new Date(m + "-15").toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                }),
                n,
              ])}
              currency={group.currency}
            />
          )}
          <People group={group} rows={rows.filter((e: any) => !e.voided_at)} />
        </>
      )}
    </View>
  );
}
export function ExpenseSearch({ groups, onOpen }: any) {
  const [text, setText] = useState(""),
    [category, setCategory] = useState("All"),
    [groupId, setGroupId] = useState("All"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [min, setMin] = useState(""),
    [max, setMax] = useState("");
  let error = "",
    results: any[] = [];
  try {
    const filter = {
      text,
      category: category === "All" ? undefined : category,
      from,
      to,
      minMinor: min ? parseMoney(min, true) : undefined,
      maxMinor: max ? parseMoney(max, true) : undefined,
    };
    if (from && to && from > to)
      throw new Error("Start date must come before end date.");
    results = groups
      .filter((g: any) => groupId === "All" || g.id === groupId)
      .flatMap((g: any) =>
        filterExpenses(g.expenses, g.members, filter).map((e) => ({ g, e })),
      )
      .sort((a: any, b: any) => b.e.spent_on.localeCompare(a.e.spent_on));
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <View style={{ gap: 14 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Search expenses</Text>
      <Field
        label="Description, person or receipt item"
        value={text}
        onChangeText={setText}
      />
      <Pills
        items={[{ id: "All", name: "All groups" }, ...groups]}
        value={groupId}
        onChange={setGroupId}
      />
      <Pills
        items={["All", ...categories]}
        value={category}
        onChange={setCategory}
      />
      <Field
        label="From date (YYYY-MM-DD)"
        value={from}
        onChangeText={setFrom}
      />
      <Field label="To date (YYYY-MM-DD)" value={to} onChangeText={setTo} />
      <Field
        label="Minimum amount (group currency)"
        value={min}
        onChangeText={setMin}
        keyboardType="decimal-pad"
      />
      <Field
        label="Maximum amount (group currency)"
        value={max}
        onChangeText={setMax}
        keyboardType="decimal-pad"
      />
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: C.red }}>
          {error}
        </Text>
      )}
      <Text>{results.length} matching expenses</Text>
      {results.slice(0, 200).map(({ g, e }) => (
        <Button
          key={e.id}
          secondary
          label={`${e.title} · ${money(e.amount_minor, g.currency)} · ${g.name} · ${e.spent_on.slice(0, 10)}`}
          onPress={() => onOpen(g, e)}
        />
      ))}
      {results.length > 200 && (
        <Text>
          Showing the first 200 matches. Narrow your search to see the rest.
        </Text>
      )}
    </View>
  );
}

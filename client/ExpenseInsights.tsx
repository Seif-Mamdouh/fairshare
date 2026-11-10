import React, { useState } from "react";
import { View, Text } from "react-native";
import { Button, Field, Pills, C } from "./components";
import { money, parseMoney, categories } from "../shared/domain";
import { filterExpenses, spendingSummary } from "../shared/insights";
function Bars({ title, rows, currency }: any) {
  const max = Math.max(1, ...rows.map((r: any) => r[1]));
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>{title}</Text>
      {rows.map(([label, amount]: [string, number]) => (
        <View
          key={label}
          accessibilityLabel={`${label}: ${money(amount, currency)}`}
          style={{ gap: 5 }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <Text style={{ flex: 1 }}>{label}</Text>
            <Text>{money(amount, currency)}</Text>
          </View>
          <View
            style={{ height: 13, backgroundColor: C.pale, borderRadius: 4 }}
          >
            <View
              style={{
                height: 13,
                width: `${(amount / max) * 100}%`,
                backgroundColor: C.green,
                borderRadius: 4,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
export function ExpenseCharts({ group }: any) {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const rows = filterExpenses(group.expenses, group.members, { from, to }),
    summary = spendingSummary(rows);
  return (
    <View style={{ gap: 20 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Spending charts</Text>
      <Text>
        Totals are in {group.currency}; removed expenses and repayments are
        excluded.
      </Text>
      <Field
        label="From date (YYYY-MM-DD)"
        value={from}
        onChangeText={setFrom}
      />
      <Field label="To date (YYYY-MM-DD)" value={to} onChangeText={setTo} />
      <Text style={{ fontSize: 30, color: C.green }}>
        {money(summary.total, group.currency)}
      </Text>
      <Text>{summary.count} expenses in this range</Text>
      {!summary.count ? (
        <Text>No spending to chart yet.</Text>
      ) : (
        <>
          <Bars
            title="By category"
            rows={summary.categories}
            currency={group.currency}
          />
          <Bars
            title="Monthly spending"
            rows={summary.months}
            currency={group.currency}
          />
          <Bars
            title="Paid by person"
            rows={summary.payers.map(([id, n]) => [
              group.members.find((m: any) => m.id === id)?.name || "Member",
              n,
            ])}
            currency={group.currency}
          />
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

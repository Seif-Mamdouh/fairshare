import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Button, Field, Pills, C } from "./components";
import { api } from "./api";
import {
  currencies,
  parseMoney,
  money,
  itemizedSplits,
  weightedSplit,
} from "../shared/domain";
import { parseReceiptText } from "../shared/receipt-scan";
import { scanReceipt } from "./ocr";
export function ExpenseTools({
  form,
  setForm,
  group,
  lockedAmount,
  onDefaultsChanged,
}: any) {
  const [page, setPage] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [currency, setCurrency] = useState(
      group.currency === "USD" ? "EUR" : "USD",
    ),
    [sourceAmount, setSourceAmount] = useState(""),
    [rate, setRate] = useState(""),
    [rateDate, setRateDate] = useState(form.spentOn),
    [rateSource, setRateSource] = useState("Manual");
  const [items, setItems] = useState<any[]>([
      {
        label: "",
        amount: "",
        memberIds: form.participants || group.members.map((m: any) => m.id),
      },
    ]),
    [tax, setTax] = useState("0"),
    [tip, setTip] = useState("0"),
    [ocrText, setOcrText] = useState("");
  async function run(fn: () => Promise<void> | void) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as any).issues?.[0]?.message || (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function useItems() {
    const itemization = {
      items: items.map((i) => ({
        label: i.label,
        amountMinor: parseMoney(i.amount),
        memberIds: i.memberIds,
      })),
      taxMinor: parseMoney(tax || "0", true),
      tipMinor: parseMoney(tip || "0", true),
    };
    const splits = itemizedSplits(itemization),
      total = splits.reduce((n, s) => n + s.amountMinor, 0);
    if (lockedAmount && total !== parseMoney(form.amount))
      throw new Error(
        "Items, tax and tip must match the posted bank purchase total.",
      );
    setForm((f: any) => ({
      ...f,
      amount: (total / 100).toFixed(2),
      splitMode: "Exact",
      participants: splits.map((s) => s.memberId),
      audience: "Selected people",
      exact: Object.fromEntries(
        splits.map((s) => [s.memberId, (s.amountMinor / 100).toFixed(2)]),
      ),
      itemization,
      conversion: undefined,
    }));
    setMessage("Itemized shares applied. Review them before saving.");
  }
  async function scan() {
    const image = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.7,
    });
    if (image.canceled) return;
    const asset = image.assets[0];
    if (!asset.base64 || asset.base64.length > 14_000_000)
      throw new Error("Choose a receipt image smaller than 10 MB.");
    const text = await scanReceipt(
      `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`,
      (p) => setMessage(`Reading receipt… ${Math.round(p * 100)}%`),
    );
    const draft = parseReceiptText(text);
    setOcrText(draft.text);
    setForm((f: any) => ({
      ...f,
      title: draft.title || f.title,
      ...(!lockedAmount && draft.amountMinor
        ? {
            amount: (draft.amountMinor / 100).toFixed(2),
            conversion: undefined,
            itemization: undefined,
          }
        : {}),
      spentOn: draft.date || f.spentOn,
    }));
    if (draft.items.length)
      setItems(
        draft.items.map((i) => ({
          label: i.label,
          amount: (i.amountMinor / 100).toFixed(2),
          memberIds: form.participants || group.members.map((m: any) => m.id),
        })),
      );
    setTax((draft.taxMinor / 100).toFixed(2));
    setTip((draft.tipMinor / 100).toFixed(2));
    setMessage(
      "Receipt draft read. Check the description, total and date; use Itemize to review each detected item. Nothing has been saved.",
    );
  }
  const update = (index: number, key: string, value: any) =>
    setItems((list) =>
      list.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    );
  async function saveDefaults() {
    const weights = (form.participants || [])
      .map((memberId: string) => ({
        memberId,
        weight:
          form.splitMode === "Saved proportions"
            ? form.defaultWeights?.find((w: any) => w.memberId === memberId)
                ?.weight || 1
            : form.splitMode === "Equal"
              ? 1
              : parseMoney(form.exact?.[memberId] || "0", true),
      }))
      .filter((w: any) => w.weight > 0);
    if (!weights.length)
      throw new Error("Choose the participants and split first.");
    await api("/groups/" + group.id + "/split-defaults", "POST", {
      paidBy: form.paidBy,
      weights,
    });
    await onDefaultsChanged?.();
    setMessage(
      "Default payer and split proportions saved for your future expenses in this group.",
    );
  }
  return (
    <View
      style={{
        gap: 12,
        marginTop: 20,
        borderTopWidth: 1,
        borderColor: C.line,
        paddingTop: 16,
      }}
    >
      <Text style={{ fontWeight: "700" }}>Expense tools · free</Text>
      <Pills
        items={["Scan receipt", "Itemize", "Currency", "Defaults"]}
        value={page}
        onChange={(v: string) => {
          setPage(v === page ? "" : v);
          setError("");
          setMessage("");
        }}
      />
      {page === "Scan receipt" && (
        <>
          <Text style={{ color: C.muted }}>
            Read a receipt photo into an editable draft. OCR runs locally in
            your browser; review every amount.
          </Text>
          <Button
            secondary
            label={busy ? "Reading receipt…" : "Choose receipt to scan"}
            disabled={busy}
            onPress={() => void run(scan)}
          />
          {!!ocrText && (
            <Field
              label="Recognized receipt text"
              value={ocrText}
              onChangeText={setOcrText}
              multiline
            />
          )}
        </>
      )}
      {page === "Currency" &&
        (lockedAmount ? (
          <Text>
            A bank import keeps its posted amount and currency. Convert a
            manually entered expense here instead.
          </Text>
        ) : (
          <>
            <Text>
              Convert a purchase into {group.currency}. The rate is a reference;
              you can enter your statement’s actual rate.
            </Text>
            <Pills
              items={currencies.filter((c) => c !== group.currency)}
              value={currency}
              onChange={(c: string) => {
                setCurrency(c);
                setRate("");
                setRateSource("Manual");
              }}
            />
            <Field
              label={"Original amount (" + currency + ")"}
              value={sourceAmount}
              onChangeText={setSourceAmount}
              keyboardType="decimal-pad"
            />
            <Field
              label="Rate date (YYYY-MM-DD)"
              value={rateDate}
              onChangeText={setRateDate}
            />
            <Button
              secondary
              label="Look up reference rate"
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  const r = await api(
                    `/exchange-rate?from=${currency}&to=${group.currency}&date=${encodeURIComponent(rateDate)}`,
                  );
                  setRate(String(r.rate));
                  setRateDate(r.date);
                  setRateSource(r.source);
                })
              }
            />
            <Field
              label={`1 ${currency} in ${group.currency}`}
              value={rate}
              onChangeText={(v: string) => {
                setRate(v);
                setRateSource("Manual");
              }}
              keyboardType="decimal-pad"
            />
            <Button
              label="Apply conversion"
              disabled={busy}
              onPress={() =>
                void run(() => {
                  const original = parseMoney(sourceAmount),
                    r = Number(rate);
                  if (!Number.isFinite(r) || r <= 0)
                    throw new Error("Enter a positive exchange rate.");
                  const converted = Math.round(original * r);
                  parseMoney((converted / 100).toFixed(2));
                  setForm((f: any) => ({
                    ...f,
                    amount: (converted / 100).toFixed(2),
                    conversion: {
                      currency,
                      amountMinor: original,
                      rate: r,
                      rateDate,
                      source: rateSource,
                    },
                    itemization: undefined,
                  }));
                  setMessage(
                    `${money(original, currency)} → ${money(converted, group.currency)}. Review the split before saving.`,
                  );
                })
              }
            />
          </>
        ))}
      {page === "Itemize" && (
        <>
          <Text>
            Enter each item’s total price, then choose who shares it. Tax and
            tip follow each person’s item subtotal.
          </Text>
          {items.map((item, i) => (
            <View
              key={i}
              style={{
                gap: 9,
                padding: 12,
                borderWidth: 1,
                borderColor: C.line,
                borderRadius: 8,
              }}
            >
              <Field
                label={`Item ${i + 1}`}
                value={item.label}
                onChangeText={(v: string) => update(i, "label", v)}
              />
              <Field
                label={`Item ${i + 1} amount (${group.currency})`}
                value={item.amount}
                onChangeText={(v: string) => update(i, "amount", v)}
                keyboardType="decimal-pad"
              />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {group.members.map((m: any) => (
                  <Pressable
                    key={m.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`Item ${i + 1}: ${m.name}`}
                    accessibilityState={{
                      checked: item.memberIds.includes(m.id),
                    }}
                    onPress={() =>
                      update(
                        i,
                        "memberIds",
                        item.memberIds.includes(m.id)
                          ? item.memberIds.filter((id: string) => id !== m.id)
                          : [...item.memberIds, m.id],
                      )
                    }
                  >
                    <Text>
                      {item.memberIds.includes(m.id) ? "☑" : "☐"} {m.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Button
                small
                secondary
                label={`Remove item ${i + 1}`}
                onPress={() =>
                  setItems((list) => list.filter((_, n) => n !== i))
                }
              />
            </View>
          ))}
          <Button
            secondary
            label="Add item"
            disabled={items.length >= 100}
            onPress={() =>
              setItems((list) => [
                ...list,
                {
                  label: "",
                  amount: "",
                  memberIds: group.members.map((m: any) => m.id),
                },
              ])
            }
          />
          <Field
            label="Tax"
            value={tax}
            onChangeText={setTax}
            keyboardType="decimal-pad"
          />
          <Field
            label="Tip"
            value={tip}
            onChangeText={setTip}
            keyboardType="decimal-pad"
          />
          <Button
            label="Apply itemized split"
            disabled={busy}
            onPress={() => void run(useItems)}
          />
        </>
      )}
      {page === "Defaults" && (
        <>
          <Text>
            Save this expense’s payer, participants and split proportions for
            your next expenses in this group. Only your defaults change.
          </Text>
          <Button
            label="Save current split as default"
            disabled={busy}
            onPress={() => void run(saveDefaults)}
          />
          <Button
            secondary
            label="Clear saved defaults"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await api("/groups/" + group.id + "/split-defaults", "DELETE");
                await onDefaultsChanged?.();
                setMessage("Defaults cleared.");
              })
            }
          />
        </>
      )}
      {!!form.conversion && (
        <Text style={{ color: C.muted }}>
          Converted from{" "}
          {money(form.conversion.amountMinor, form.conversion.currency)} ·{" "}
          {form.conversion.source} · {form.conversion.rateDate}
        </Text>
      )}
      {!!form.itemization && (
        <Button
          small
          secondary
          label="Use manual split instead"
          onPress={() =>
            setForm((f: any) => ({ ...f, itemization: undefined }))
          }
        />
      )}
      {!!form.itemization && (
        <Text style={{ color: C.green }}>
          Itemized split applied: {form.itemization.items.length} items
        </Text>
      )}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={{ color: C.green }}>
          {message}
        </Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: C.red }}>
          {error}
        </Text>
      )}
    </View>
  );
}

import { z } from "zod";
export const currencies = ["USD", "EUR", "GBP", "CAD", "AUD", "EGP"] as const;
export const categories = [
  "Food & drink",
  "Groceries",
  "Transport",
  "Stay",
  "Shopping",
  "Other",
] as const;
export type Member = { id: string; name: string; user_id?: string };
export type Split = { memberId: string; amountMinor: number };
export const moneySchema = z.number().int().positive().max(100_000_000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Use a valid calendar date",
  );
export const itemizationSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(150),
            amountMinor: moneySchema,
            memberIds: z.array(z.string().min(1)).min(1).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    taxMinor: z.number().int().min(0).max(100_000_000),
    tipMinor: z.number().int().min(0).max(100_000_000),
  })
  .strict();
export const conversionSchema = z
  .object({
    currency: z.enum(currencies),
    amountMinor: moneySchema,
    rate: z.number().finite().positive().max(1_000_000),
    rateDate: date,
    source: z.enum(["Frankfurter", "Manual"]),
  })
  .strict();
export function weightedSplit(
  amount: number,
  weights: { memberId: string; weight: number }[],
): Split[] {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    !weights.length ||
    new Set(weights.map((w) => w.memberId)).size !== weights.length ||
    weights.some((w) => !Number.isSafeInteger(w.weight) || w.weight < 0) ||
    !weights.some((w) => w.weight > 0)
  )
    throw new Error("Choose valid unique participants and weights");
  const total = weights.reduce((n, w) => n + BigInt(w.weight), 0n);
  const rows = weights.map((w, i) => ({
    memberId: w.memberId,
    amountMinor: Number((BigInt(amount) * BigInt(w.weight)) / total),
    remainder: (BigInt(amount) * BigInt(w.weight)) % total,
    i,
  }));
  let left = amount - rows.reduce((n, w) => n + w.amountMinor, 0);
  const order = [...rows].sort((a, b) =>
    a.remainder === b.remainder
      ? a.i - b.i
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (let i = 0; i < left; i++) order[i].amountMinor++;
  return rows.map(({ memberId, amountMinor }) => ({ memberId, amountMinor }));
}
export function itemizedSplits(input: z.infer<typeof itemizationSchema>) {
  const data = itemizationSchema.parse(input),
    base = new Map<string, number>();
  for (const item of data.items)
    for (const part of equalSplit(item.amountMinor, item.memberIds))
      base.set(
        part.memberId,
        (base.get(part.memberId) || 0) + part.amountMinor,
      );
  const extras = weightedSplit(
    data.taxMinor + data.tipMinor,
    [...base].map(([memberId, weight]) => ({ memberId, weight })),
  );
  return extras.map((p) => ({
    ...p,
    amountMinor: p.amountMinor + base.get(p.memberId)!,
  }));
}
export const expenseSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    amountMinor: moneySchema,
    paidBy: z.string().min(1),
    splits: z
      .array(
        z.object({
          memberId: z.string().min(1),
          amountMinor: z.number().int().min(0).max(100_000_000),
        }),
      )
      .min(1)
      .max(100),
    category: z.enum(categories).default("Other"),
    spentOn: date,
    itemization: itemizationSchema.optional(),
    conversion: conversionSchema.optional(),
  })
  .strict();
export const receiptSchema = expenseSchema
  .omit({ itemization: true, conversion: true })
  .extend({
    currency: z.enum(currencies),
    sourceId: z.string().trim().min(1).max(150),
    imageData: z.string().max(1_400_000).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();
export type ExpenseInput = z.infer<typeof expenseSchema>;
export function validateSplits(expense: ExpenseInput, memberIds: string[]) {
  if (expense.itemization) {
    const parts = itemizedSplits(expense.itemization);
    if (
      parts.length !== expense.splits.length ||
      parts.some(
        (p) =>
          expense.splits.find((s) => s.memberId === p.memberId)?.amountMinor !==
          p.amountMinor,
      )
    )
      throw new Error("Itemized shares must match the expense splits");
  }
  if (
    expense.conversion &&
    Math.round(expense.conversion.amountMinor * expense.conversion.rate) !==
      expense.amountMinor
  )
    throw new Error("Converted amount does not match the saved exchange rate");

  if (
    !memberIds.includes(expense.paidBy) ||
    expense.splits.some((s) => !memberIds.includes(s.memberId))
  )
    throw new Error("Payer and split members must belong to this group");
  if (
    new Set(expense.splits.map((s) => s.memberId)).size !==
    expense.splits.length
  )
    throw new Error("Each split member must appear once");
  if (
    expense.splits.reduce((sum, s) => sum + s.amountMinor, 0) !==
    expense.amountMinor
  )
    throw new Error("Splits must add up to the expense total");
}
export function equalSplit(amount: number, ids: string[]): Split[] {
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    ids.length === 0 ||
    new Set(ids).size !== ids.length
  )
    throw new Error("Choose a positive amount and unique members");
  return ids.map((memberId, i) => ({
    memberId,
    amountMinor:
      Math.floor(amount / ids.length) + (i < amount % ids.length ? 1 : 0),
  }));
}
export function parseMoney(value: string, allowZero = false): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter an amount with up to two decimal places");
  const [whole, fraction = ""] = value.trim().split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (
    !Number.isSafeInteger(result) ||
    result < (allowZero ? 0 : 1) ||
    result > 100_000_000
  )
    throw new Error(
      `Amount must be between ${allowZero ? "0" : "0.01"} and 1,000,000`,
    );
  return result;
}
export function balances(
  members: Member[],
  expenses: any[],
  settlements: any[],
) {
  const net: Record<string, number> = Object.fromEntries(
    members.map((m) => [m.id, 0]),
  );
  for (const e of expenses) {
    if (e.voided_at) continue;
    net[e.paid_by] += e.amount_minor;
    for (const s of e.splits as Split[]) net[s.memberId] -= s.amountMinor;
  }
  for (const s of settlements) {
    net[s.from_member] += s.amount_minor;
    net[s.to_member] -= s.amount_minor;
  }
  return net;
}
export function simplifyDebts(net: Record<string, number>) {
  const creditors = Object.entries(net)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({ id, n }));
  const debtors = Object.entries(net)
    .filter(([, n]) => n < 0)
    .map(([id, n]) => ({ id, n: -n }));
  const transfers: { from: string; to: string; amountMinor: number }[] = [];
  let i = 0,
    j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amountMinor = Math.min(debtors[i].n, creditors[j].n);
    transfers.push({ from: debtors[i].id, to: creditors[j].id, amountMinor });
    debtors[i].n -= amountMinor;
    creditors[j].n -= amountMinor;
    if (!debtors[i].n) i++;
    if (!creditors[j].n) j++;
  }
  return transfers;
}
export function money(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    amount / 100,
  );
}

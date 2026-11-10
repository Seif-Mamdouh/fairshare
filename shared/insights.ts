export type ExpenseFilter = {
  text?: string;
  category?: string;
  from?: string;
  to?: string;
  minMinor?: number;
  maxMinor?: number;
  memberId?: string;
};
export function filterExpenses(
  expenses: any[],
  members: any[],
  f: ExpenseFilter,
) {
  const query = (f.text || "").trim().toLowerCase();
  return expenses
    .filter(
      (e) =>
        !e.voided_at &&
        (!f.category || e.category === f.category) &&
        (!f.from || e.spent_on.slice(0, 10) >= f.from) &&
        (!f.to || e.spent_on.slice(0, 10) <= f.to) &&
        (f.minMinor === undefined || e.amount_minor >= f.minMinor) &&
        (f.maxMinor === undefined || e.amount_minor <= f.maxMinor) &&
        (!f.memberId ||
          e.paid_by === f.memberId ||
          e.splits.some((s: any) => s.memberId === f.memberId)) &&
        (!query ||
          [
            e.title,
            e.category,
            ...members
              .filter(
                (m) =>
                  m.id === e.paid_by ||
                  e.splits.some((s: any) => s.memberId === m.id),
              )
              .map((m) => m.name),
            ...(e.itemization?.items || []).map((i: any) => i.label),
          ]
            .join(" ")
            .toLowerCase()
            .includes(query)),
    )
    .sort((a, b) => b.spent_on.localeCompare(a.spent_on));
}
export function spendingSummary(expenses: any[]) {
  const active = expenses.filter((e) => !e.voided_at);
  const by = (key: (e: any) => string) => {
    const out: Record<string, number> = {};
    for (const e of active) out[key(e)] = (out[key(e)] || 0) + e.amount_minor;
    return Object.entries(out);
  };
  return {
    total: active.reduce((n, e) => n + e.amount_minor, 0),
    count: active.length,
    categories: by((e) => e.category).sort((a, b) => b[1] - a[1]),
    months: by((e) => e.spent_on.slice(0, 7)).sort((a, b) =>
      a[0].localeCompare(b[0]),
    ),
    payers: by((e) => e.paid_by),
  };
}

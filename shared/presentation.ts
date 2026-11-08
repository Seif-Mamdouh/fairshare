export function expenseImpact(expense: any, memberId: string | undefined) {
  if (!memberId || expense.voided_at) return 0;
  const share =
    expense.splits.find((s: any) => s.memberId === memberId)?.amountMinor || 0;
  return (expense.paid_by === memberId ? expense.amount_minor : 0) - share;
}
export function overallBalances(groups: any[], userId: string) {
  const totals: Record<string, number> = {};
  for (const g of groups) {
    const me = g.members.find((m: any) => m.user_id === userId);
    totals[g.currency] = (totals[g.currency] || 0) + (g.balances[me?.id] || 0);
  }
  return totals;
}

export function expenseDate(value: string) {
  return new Date(value.slice(0, 10) + "T12:00:00");
}

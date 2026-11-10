import {
  expenseSchema,
  equalSplit,
  weightedSplit,
  parseMoney,
} from "../shared/domain";
export function expenseFromForm(form: any) {
  const amountMinor = parseMoney(form.amount);
  const splits =
    form.splitMode === "Equal"
      ? equalSplit(amountMinor, form.participants)
      : form.splitMode === "Saved proportions"
        ? weightedSplit(
            amountMinor,
            form.participants.map((memberId: string) => ({
              memberId,
              weight:
                form.defaultWeights?.find((w: any) => w.memberId === memberId)
                  ?.weight || 1,
            })),
          )
        : form.participants.map((memberId: string) => ({
            memberId,
            amountMinor: parseMoney(form.exact[memberId] || "", true),
          }));
  return expenseSchema.parse({
    title: form.title,
    amountMinor,
    paidBy: form.paidBy,
    splits,
    category: form.category,
    spentOn: form.spentOn,
    ...(form.itemization ? { itemization: form.itemization } : {}),
    ...(form.conversion ? { conversion: form.conversion } : {}),
  });
}

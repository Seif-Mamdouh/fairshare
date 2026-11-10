import { isDeepStrictEqual } from "node:util";
import { hash } from "./auth";
import type { Database } from "./db";
import {
  equalSplit,
  expenseSchema,
  receiptSchema,
  type ExpenseInput,
} from "../shared/domain";
import {
  listReceiptsSchema,
  updateDraftSchema,
  rejectDraftSchema,
  updateExpenseSchema,
  voidExpenseSchema,
} from "../shared/agent-management";

type Agent = { id: string; group_id: string };
function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
function expenseInput(e: any): ExpenseInput {
  return {
    title: e.title,
    amountMinor: e.amount_minor,
    paidBy: e.paid_by,
    splits: e.splits,
    category: e.category,
    spentOn:
      e.spent_on instanceof Date
        ? e.spent_on.toISOString().slice(0, 10)
        : String(e.spent_on).slice(0, 10),
    ...(e.itemization ? { itemization: e.itemization } : {}),
    ...(e.conversion ? { conversion: e.conversion } : {}),
  };
}
function expenseView(e: any) {
  const fields = expenseInput(e);
  return {
    id: e.id,
    ...fields,
    voided: !!e.voided_at,
    revision: hash(JSON.stringify([e.id, fields, !!e.voided_at])),
  };
}
export function receiptView(r: any) {
  return {
    id: r.id,
    payload: r.payload,
    status: r.status,
    expense_id: r.expense_id,
    created_at: r.created_at,
    reviewed_at: r.reviewed_at,
    has_image: r.has_image ?? !!r.image_data,
    revision: hash(JSON.stringify([r.id, r.payload, r.status, r.expense_id])),
    ...(r.expense ? { expense: expenseView(r.expense) } : {}),
  };
}
function requireRevision(actual: string, expected: string) {
  if (actual !== expected)
    fail(
      409,
      "This record changed. Read it again and review the latest fields before retrying.",
    );
}
function applyChanges(original: any, changes: any, equalIds?: string[]) {
  if (equalIds && changes.splits !== undefined)
    fail(400, "Choose either explicit splits or equalSplitMemberIds");
  if (!Object.keys(changes).length && !equalIds)
    fail(400, "Provide changes or equalSplitMemberIds");
  const next = { ...original, ...changes };
  if (next.itemization === null) delete next.itemization;
  if (next.conversion === null) delete next.conversion;
  if (equalIds) {
    next.splits = equalSplit(next.amountMinor, [...equalIds].sort());
    // Equal splitting replaces item-level allocation, not the expense itself.
    delete next.itemization;
  }
  return next;
}

export function agentReceiptManagement(
  db: Database,
  validateExpense: (
    tx: Database,
    group: string,
    data: ExpenseInput,
  ) => Promise<void>,
) {
  async function read(a: Agent, receiptId: string) {
    const row = (
      await db.query(
        "SELECT r.*,(SELECT row_to_json(e) FROM expenses e WHERE e.id=r.expense_id AND e.group_id=r.group_id) AS expense FROM receipts r WHERE r.id=$1 AND r.agent_id=$2 AND r.group_id=$3",
        [receiptId, a.id, a.group_id],
      )
    ).rows[0];
    if (!row) fail(404, "Receipt not found");
    return receiptView(row);
  }
  async function list(a: Agent, raw: unknown) {
    const data = listReceiptsSchema.parse(raw);
    const rows = (
      await db.query(
        "SELECT r.id,r.payload,r.status,r.expense_id,r.created_at,r.reviewed_at,(r.image_data IS NOT NULL) AS has_image,(SELECT row_to_json(e) FROM expenses e WHERE e.id=r.expense_id AND e.group_id=r.group_id) AS expense FROM receipts r WHERE r.agent_id=$1 AND r.group_id=$2 AND r.id>$3 AND ($4::text IS NULL OR r.status=$4) ORDER BY r.id LIMIT 101",
        [a.id, a.group_id, data.afterId || "", data.status || null],
      )
    ).rows;
    return {
      receipts: rows.slice(0, 100).map(receiptView),
      nextAfterId: rows.length > 100 ? rows[99].id : null,
    };
  }
  async function draft(a: Agent, raw: unknown, reject = false) {
    const update = reject ? null : updateDraftSchema.parse(raw);
    const data = update ?? rejectDraftSchema.parse(raw);
    return db.transaction(async (tx) => {
      const r = (
        await tx.query(
          "SELECT * FROM receipts WHERE id=$1 AND agent_id=$2 AND group_id=$3 FOR UPDATE",
          [data.receiptId, a.id, a.group_id],
        )
      ).rows[0];
      if (!r) fail(404, "Receipt not found");
      if (reject && r.status === "rejected")
        return { ...receiptView(r), replayed: true };
      if (r.status !== "pending")
        fail(
          409,
          "Only pending drafts can be edited or rejected. Use update_expense or void_expense for posted expenses.",
        );
      let payload = r.payload;
      if (update) {
        payload = receiptSchema.parse(
          applyChanges(r.payload, update.changes, update.equalSplitMemberIds),
        );
        const group = (
          await tx.query("SELECT currency FROM groups WHERE id=$1", [
            a.group_id,
          ])
        ).rows[0];
        if (payload.currency !== group.currency)
          fail(400, "Receipt currency must match the group");
        await validateExpense(tx, a.group_id, payload);
        if (isDeepStrictEqual(payload, r.payload))
          return { ...receiptView(r), replayed: true };
      }
      requireRevision(receiptView(r).revision, data.expectedRevision);
      const updated = (
        await tx.query(
          "UPDATE receipts SET payload=$1,status=$2,reviewed_at=CASE WHEN $2='rejected' THEN now() ELSE reviewed_at END WHERE id=$3 RETURNING *",
          [JSON.stringify(payload), reject ? "rejected" : "pending", r.id],
        )
      ).rows[0];
      return { ...receiptView(updated), replayed: false };
    });
  }
  async function expense(a: Agent, raw: unknown, voiding = false) {
    const update = voiding ? null : updateExpenseSchema.parse(raw);
    const data = update ?? voidExpenseSchema.parse(raw);
    return db.transaction(async (tx) => {
      const e = (
        await tx.query(
          "SELECT e.* FROM expenses e WHERE e.id=$1 AND e.group_id=$2 AND EXISTS(SELECT 1 FROM receipts r WHERE r.expense_id=e.id AND r.agent_id=$3 AND r.group_id=e.group_id AND r.status='approved') FOR UPDATE",
          [data.expenseId, a.group_id, a.id],
        )
      ).rows[0];
      if (!e) fail(404, "Expense not found");
      if (voiding && e.voided_at) return { ...expenseView(e), replayed: true };
      if (e.voided_at)
        fail(409, "Voided expenses cannot be edited or restored");
      let next = expenseInput(e);
      if (update) {
        next = expenseSchema.parse(
          applyChanges(next, update.changes, update.equalSplitMemberIds),
        );
        await validateExpense(tx, a.group_id, next);
        if (isDeepStrictEqual(next, expenseInput(e)))
          return { ...expenseView(e), replayed: true };
      }
      requireRevision(expenseView(e).revision, data.expectedRevision);
      const updated = voiding
        ? (
            await tx.query(
              "UPDATE expenses SET voided_at=now() WHERE id=$1 RETURNING *",
              [e.id],
            )
          ).rows[0]
        : (
            await tx.query(
              "UPDATE expenses SET title=$1,amount_minor=$2,paid_by=$3,splits=$4,category=$5,spent_on=$6,itemization=$7,conversion=$8 WHERE id=$9 RETURNING *",
              [
                next.title,
                next.amountMinor,
                next.paidBy,
                JSON.stringify(next.splits),
                next.category,
                next.spentOn,
                next.itemization ? JSON.stringify(next.itemization) : null,
                next.conversion ? JSON.stringify(next.conversion) : null,
                e.id,
              ],
            )
          ).rows[0];
      return { ...expenseView(updated), replayed: false };
    });
  }
  return {
    read,
    list,
    updateDraft: (a: Agent, raw: unknown) => draft(a, raw),
    rejectDraft: (a: Agent, raw: unknown) => draft(a, raw, true),
    updateExpense: (a: Agent, raw: unknown) => expense(a, raw),
    voidExpense: (a: Agent, raw: unknown) => expense(a, raw, true),
  };
}

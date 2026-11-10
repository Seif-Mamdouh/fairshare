import { z } from "zod";
import { expenseSchema } from "./domain";

const id = z.string().min(1).max(150);
const confirmed = {
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  userConfirmed: z.literal(true),
};
const equalMembers = z
  .array(id)
  .min(1)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, "Members must be unique")
  .optional();
// Null explicitly clears expense metadata when switching from itemized splits.
export const expenseChangesSchema = expenseSchema
  .partial()
  .extend({
    itemization: expenseSchema.shape.itemization.unwrap().nullable().optional(),
    conversion: expenseSchema.shape.conversion.unwrap().nullable().optional(),
  })
  .strict();
export const draftChangesSchema = expenseSchema
  .omit({ itemization: true, conversion: true })
  .partial()
  .extend({ notes: z.string().max(2000).optional() })
  .strict();
export const listReceiptsSchema = z
  .object({
    afterId: id.optional(),
    status: z.enum(["pending", "approved", "rejected"]).optional(),
  })
  .strict();
export const updateDraftSchema = z
  .object({
    receiptId: id,
    ...confirmed,
    changes: draftChangesSchema,
    equalSplitMemberIds: equalMembers,
  })
  .strict();
export const rejectDraftSchema = z
  .object({ receiptId: id, ...confirmed })
  .strict();
export const updateExpenseSchema = z
  .object({
    expenseId: id,
    ...confirmed,
    changes: expenseChangesSchema,
    equalSplitMemberIds: equalMembers,
  })
  .strict();
export const voidExpenseSchema = z
  .object({ expenseId: id, ...confirmed })
  .strict();

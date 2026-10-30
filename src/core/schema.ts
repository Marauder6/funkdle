// zod schema for data/items.json (SPEC 5.2). Used by data:build before writing and by the tests.
// Checks meaning as well as shape (U-validate-outbound): derived counts, uniqueness, sort order.

import { z } from "zod";
import { COMPONENT_NAMES, ORIGINS } from "./types";

const twoDecimals = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-9;

export const ItemSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().min(1),
    value: z.number().int().min(0),
    weight: z.number().min(0).refine(twoDecimals, "weight has more than 2 decimal places"),
    components: z.partialRecord(z.enum(COMPONENT_NAMES), z.number().int().min(1)),
    totalComponents: z.number().int().min(1),
    uniqueComponents: z.number().int().min(1),
    origin: z.enum(ORIGINS),
    formIds: z.array(z.string().min(1)).min(1),
    inTargetPool: z.boolean(),
  })
  .superRefine((item, ctx) => {
    const quantities = Object.values(item.components);
    const total = quantities.reduce((a, b) => a + b, 0);
    if (item.totalComponents !== total) {
      ctx.addIssue({ code: "custom", message: `${item.id}: totalComponents != ${total}` });
    }
    if (item.uniqueComponents !== quantities.length) {
      ctx.addIssue({
        code: "custom",
        message: `${item.id}: uniqueComponents != ${quantities.length}`,
      });
    }
  });

export const DatasetSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    source: z.strictObject({
      title: z.string().min(1),
      url: z.url(),
      revisionId: z.number().int().positive(),
      retrievedAt: z.iso.datetime(),
    }),
    generatedAt: z.iso.datetime(),
    items: z.array(ItemSchema).min(1),
  })
  .superRefine((ds, ctx) => {
    const ids = ds.items.map((i) => i.id);
    const names = ds.items.map((i) => i.name.toLowerCase());
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "duplicate id" });
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: "custom", message: "duplicate name (case-insensitive)" });
    }
    const sorted = [...ids].sort();
    if (ids.some((id, i) => id !== sorted[i])) {
      ctx.addIssue({ code: "custom", message: "items not sorted by id" });
    }
  });

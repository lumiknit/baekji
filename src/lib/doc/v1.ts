import { z } from 'zod/v4';

/** Schema version for v1 */
export const schemaVersion: number = 1;

// --- ProjectMeta ---

export const projectMetaSchema = z.object({
  id: z.string(),
  label: z.string(),
  updatedAt: z.string(),
  tagColors: z
    .record(z.string(), z.object({ h: z.number(), s: z.number() }))
    .default({}),
});
export type ProjectMeta = z.infer<typeof projectMetaSchema>;

// --- SheetMeta ---

export const sheetMetaSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  updatedAt: z.string(),
  orderKey: z.number(),
  tags: z.array(z.string()).default([]),
  deletedAt: z.string().optional(),
});
export type SheetMeta = z.infer<typeof sheetMetaSchema>;

// --- BakV1 (backup format) ---

export const bakSheetSchema = z.object({
  id: z.string(),
  updatedAt: z.string(),
  orderKey: z.number(),
  tags: z.array(z.string()).default([]),
  content: z.string(),
});
export type BakSheet = z.infer<typeof bakSheetSchema>;

export const bakV1Schema = z.object({
  $appVersion: z.string(),
  $schemaVersion: z.literal(1),
  $projectId: z.string(),
  label: z.string(),
  updatedAt: z.string(),
  exportedAt: z.string(),
  exportedBy: z.string(),
  tagColors: z
    .record(z.string(), z.object({ h: z.number(), s: z.number() }))
    .default({}),
  sheets: z.array(bakSheetSchema),
});
export type BakV1 = z.infer<typeof bakV1Schema>;

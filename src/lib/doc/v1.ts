import { z } from 'zod/v4';

/** Schema version for v1 */
export const schemaVersion: number = 1;

// --- ProjectMeta ---

export const projectMetaSchema = z.object({
  id: z.string(),
  label: z.string(),
  updatedAt: z.string(),
  committedAt: z.string().default(''),
  tagColors: z
    .record(z.string(), z.object({ h: z.number(), s: z.number() }))
    .default({}),
});
export type ProjectMeta = z.infer<typeof projectMetaSchema>;

// --- WritingGoal ---

export const writingGoalSchema = z.object({
  startedAt: z.string(),
  startedWritingSeconds: z.number(),
  dueAt: z.string().optional(),
  goalChars: z.number(),
  achievedAt: z.string().optional(),
  achievedWritingSeconds: z.number().optional(),
});
export type WritingGoal = z.infer<typeof writingGoalSchema>;

// --- SheetMeta ---

export const sheetMetaSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  orderKey: z.number(),
  tags: z.array(z.string()).default([]),
  deletedAt: z.string().optional(),
  goal: writingGoalSchema.optional(),
});
export type SheetMeta = z.infer<typeof sheetMetaSchema>;

// --- SheetStats ---

export const sheetStatsSchema = z.object({
  sheetId: z.string(),
  updatedAt: z.string(),
  writingSeconds: z.number(),
});
export type SheetStats = z.infer<typeof sheetStatsSchema>;

// --- BakV1 (backup format) ---

export const bakSheetSchema = z.object({
  id: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string()).default([]),
  deletedAt: z.string().optional(),
  writingSeconds: z.number().default(0),
  goal: writingGoalSchema.optional(),
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

# V1 Backup Format & Import Strategies

## Overview

Baekji stores project data internally using [Yjs](https://github.com/yjs/yjs) (a CRDT library). However, external backups — whether saved locally or synced via Dropbox — are exported as plain **snapshots**: a single JSON object compressed with gzip (`.bak.gz`).

Because snapshots are point-in-time captures rather than CRDT state, merging two diverged versions requires explicit conflict detection logic (see Import Strategies below).

---

## Snapshot Format

A backup file is a gzipped JSON object conforming to the `BakV1` schema:

```ts
{
  $appVersion: string;      // app version that produced this backup
  $schemaVersion: 1;
  $projectId: string;       // stable project UUID
  label: string;            // project display name
  updatedAt: string;        // ISO timestamp of last project edit
  exportedAt: string;       // ISO timestamp when this backup was created
  exportedBy: string;       // device ID that exported it
  tagColors: Record<string, { h: number; s: number }>;
  sheets: BakSheet[];       // ordered array — index = display order
}
```

Each sheet:

```ts
{
  id: string;
  updatedAt: string;        // ISO timestamp of last edit (content or tags or deletion)
  tags: string[];
  deletedAt?: string;       // present if the sheet is in the trash
  content: string;          // full plain-text content
}
```

**Notes:**

- Sheet order is determined by array position; there is no `orderKey` field in the backup.
- Deleted (trashed) sheets are included so that deletions can propagate on merge.
- `updatedAt` is bumped on any meaningful change: content edits (debounced ~3 s), tag changes, and soft-deletion.

---

## `committedAt` — the merge anchor

`ProjectMeta` carries a `committedAt` field (ISO string, empty if never exported).

- **Updated** every time a backup is exported.
- **Meaning**: "the last point in time at which the local project and an external backup were known to be in sync."

This timestamp is the key reference point for merge decisions.

---

## Import Strategies

### 1. Merge _(default)_

Compares the incoming snapshot against the local project using `committedAt` as the baseline.

For each sheet in the snapshot, one of four outcomes applies:

| Condition                                                              | Outcome                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `snapshot.updatedAt <= committedAt`                                    | **Ignore** — snapshot is older than or equal to the last known sync point; keep local as-is                                                                                                                              |
| `local.updatedAt <= committedAt < snapshot.updatedAt`                  | **Fast-forward** — local has no new edits since last sync; overwrite local with snapshot. The previous local content is copied to a new trash sheet tagged `overwritten`.                                                |
| `committedAt < local.updatedAt` and `committedAt < snapshot.updatedAt` | **Conflict** — both sides were edited after last sync. The local sheet keeps its ID and gains the tag `conflict:local`. A new sheet is created from the snapshot with tag `conflict:remote`, inserted immediately after. |
| Sheet exists only in snapshot                                          | **New** — simply added to the project.                                                                                                                                                                                   |
| Sheet exists only locally                                              | Left untouched.                                                                                                                                                                                                          |

**Sheet ordering after merge:**

1. The snapshot's array order is the primary ordering.
2. Local-only sheets are kept adjacent to their last preceding snapshot sheet (i.e. they "follow" whatever snapshot sheet they came after in the original local order).
3. Conflict pairs are placed together: `conflict:local` at the snapshot position, `conflict:remote` immediately after.

**Stale snapshot warning:**
If `snapshot.exportedAt <= localMeta.committedAt`, the user is warned that they are importing an older backup and must confirm before proceeding.

---

### 2. Overwrite

Replaces the local project entirely with the snapshot. All local sheets not present in the snapshot are deleted; all snapshot sheets are written verbatim. `committedAt` is set to `snapshot.exportedAt`.

Use this when you want a clean restore with no merge logic.

---

### 3. New Project

Creates a brand-new project (new `$projectId`, new sheet IDs for all sheets) from the snapshot. The original project is untouched. Effectively a clone/import-as-copy operation.

---

## Summary Table

| Strategy    | Local-only sheets | Same-ID sheets         | Order                                   |
| ----------- | ----------------- | ---------------------- | --------------------------------------- |
| Merge       | Kept              | Ignore / FF / Conflict | Snapshot order + local-only interleaved |
| Overwrite   | Deleted           | Replaced               | Snapshot order                          |
| New Project | —                 | New IDs                | Snapshot order                          |

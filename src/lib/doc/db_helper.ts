import {
  getSheetContent,
  updateSheetSnapshotAtomic,
  getSheetDeltas,
  putSheetDelta,
  getNode,
  getChildren,
  putNode,
  createNodeAtomic,
  insertVersion,
} from './db';
import type { BakImportResult } from './backup';
import type { SheetContent, SheetNode } from './v0';
import { genUnorderedId } from '../uuid';
import { ChangeSet, Text } from '@codemirror/state';
import { getShortLabel } from '../markdown';

export { getShortLabel };

// ─── Markdown-native load/save (CodeMirror editor) ───────────

export interface MarkdownSheetState {
  markdown: string;
  selection: { anchor: number; head: number };
  /** contentId of the current snapshot; new CM6 deltas are appended to this */
  contentId: string | null;
  /** next seq number for delta saves (= number of existing CM6 deltas) */
  nextDeltaSeq: number;
}

const DEFAULT_SELECTION = { anchor: 0, head: 0 };

export async function loadMarkdownSheetState(
  nodeId: string,
): Promise<MarkdownSheetState> {
  const content = await getSheetContent(nodeId);
  if (!content) {
    return {
      markdown: '',
      selection: DEFAULT_SELECTION,
      contentId: null,
      nextDeltaSeq: 0,
    };
  }

  const deltas = await getSheetDeltas(content.id);
  if (deltas.length === 0) {
    return {
      markdown: content.markdown,
      selection: content.selection ?? DEFAULT_SELECTION,
      contentId: content.id,
      nextDeltaSeq: 0,
    };
  }

  // CM6 deltas — apply each ChangeSet to reconstruct current document
  let doc = Text.of(content.markdown.split('\n'));
  let selection = content.selection ?? DEFAULT_SELECTION;
  for (const delta of deltas) {
    const changes = (delta as { changes?: unknown }).changes;
    if (!changes) continue;
    doc = (ChangeSet.fromJSON(changes) as ChangeSet).apply(doc);
    selection = delta.selection ?? selection;
  }
  return {
    markdown: doc.toString(),
    selection,
    contentId: content.id,
    nextDeltaSeq: deltas.length,
  };
}

/** Hard save: write a full markdown snapshot, clear all deltas. Returns new contentId and auto-label. */
export async function saveMarkdownSheet(
  nodeId: string,
  markdown: string,
  selection: { anchor: number; head: number },
): Promise<{ contentId: string; label: string }> {
  const contentId = genUnorderedId();
  const newContent: SheetContent = {
    id: contentId,
    nodeId,
    markdown,
    selection,
  };
  await updateSheetSnapshotAtomic(newContent);
  return { contentId, label: getShortLabel(markdown) };
}

/** Soft save: append a CM6 ChangeSet delta to the current snapshot. */
export async function saveDeltaMarkdownSheet(
  contentId: string,
  seq: number,
  changes: unknown,
  selection: { anchor: number; head: number },
): Promise<void> {
  await putSheetDelta({ contentId, seq, changes, selection });
}

// ─── Project Creation ─────────────────────────────────────────

export interface NewProjectIds {
  projectId: string;
  pjVerId: string;
}

export async function createProject(label: string): Promise<NewProjectIds> {
  const projectId = genUnorderedId();
  const pjVerId = genUnorderedId();
  const now = new Date().toISOString();
  await putNode({
    id: pjVerId,
    projectId,
    label,
    type: 'versionRoot',
    active: true,
    updatedAt: now,
  });
  return { projectId, pjVerId };
}

// ─── Sheet Content as Markdown ────────────────────────────────

export async function getSheetContentAsMarkdown(
  nodeId: string,
): Promise<string> {
  const content = await getSheetContent(nodeId);
  if (!content) return '';

  const deltas = await getSheetDeltas(content.id);
  if (deltas.length === 0) return content.markdown;

  let doc = Text.of(content.markdown.split('\n'));
  for (const delta of deltas) {
    const changes = delta.changes;
    if (!changes) continue;
    doc = ChangeSet.fromJSON(changes).apply(doc);
  }
  return doc.toString();
}

// ─── Group Merge Helper ───────────────────────────────────────

export async function collectGroupMarkdown(
  groupId: string,
  nodes: Record<string, { type: string; children?: string[] }>,
): Promise<string> {
  const parts: string[] = [];
  async function walk(nodeId: string) {
    const node = nodes[nodeId];
    if (!node) return;
    if (node.type === 'sheet') {
      const md = (await getSheetContentAsMarkdown(nodeId)).trim();
      if (md) parts.push(md);
    } else {
      for (const childId of node.children ?? []) {
        await walk(childId);
      }
    }
  }
  await walk(groupId);
  return parts.join('\n\n');
}

// ─── Tree Traversal ───────────────────────────────────────────

export async function collectText(
  nodeId: string,
  includeHidden: boolean,
): Promise<string> {
  const parts: string[] = [];
  await walkNode(nodeId, includeHidden, parts);
  return parts.join('\n\n');
}

async function walkNode(
  nodeId: string,
  includeHidden: boolean,
  parts: string[],
): Promise<void> {
  const node = await getNode(nodeId);
  if (!node) return;

  if (
    node.type !== 'versionRoot' &&
    node.label.startsWith('.') &&
    !includeHidden
  )
    return;

  if (node.type === 'sheet') {
    const content = (await getSheetContentAsMarkdown(nodeId)).trim();
    if (content) parts.push(content);
    return;
  }

  const children = await getChildren(nodeId);
  for (const child of children) {
    await walkNode(child.id, includeHidden, parts);
  }
}

// ─── Import ───────────────────────────────────────────────────

export async function commitBakImport(result: BakImportResult): Promise<void> {
  await insertVersion(result.versionRoot, result.nodes, result.sheetContents);
}

export async function importTextAsSheet(
  text: string,
  label: string,
  pjVerId: string,
  parentId: string,
): Promise<string> {
  const parent = await getNode(parentId);
  if (!parent || parent.type === 'sheet') throw new Error('Invalid parent');

  const newId = genUnorderedId();
  const now = new Date().toISOString();

  const sheet: SheetNode = {
    id: newId,
    pjVerId,
    parentId,
    label: label.replace(/\.[^.]+$/, ''),
    type: 'sheet',
    updatedAt: now,
    visual: { colorH: 0, colorS: 0 },
    tags: [],
    orderKey: 0,
  };

  const sheetContent: SheetContent = {
    id: genUnorderedId(),
    nodeId: newId,
    markdown: text,
    selection: DEFAULT_SELECTION,
  };

  await createNodeAtomic(sheet, sheetContent);
  return newId;
}

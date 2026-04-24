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
import { genId } from '../uuid';
import {
  pmSchema,
  replayDeltas,
  docToMarkdown,
  markdownToDoc,
  getShortLabel,
  extractDocLabel,
} from '../pm_content';

export { getShortLabel, extractDocLabel };

// ─── Project Creation ─────────────────────────────────────────

export interface NewProjectIds {
  projectId: string;
  pjVerId: string;
}

export async function createProject(label: string): Promise<NewProjectIds> {
  const projectId = genId();
  const pjVerId = genId();
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

// ─── Load Sheet State ─────────────────────────────────────────

export interface SheetState {
  pmJSON: unknown;
  nextSeq: number;
  contentId: string | null;
  selection: { anchor: number; head: number };
  partialLoad?: boolean;
}

export async function loadSheetState(nodeId: string): Promise<SheetState> {
  const emptyDoc = pmSchema.topNodeType.createAndFill()!.toJSON();

  const content = await getSheetContent(nodeId);
  if (!content) {
    return {
      pmJSON: emptyDoc,
      nextSeq: 0,
      contentId: null,
      selection: { anchor: 0, head: 0 },
    };
  }

  const deltas = await getSheetDeltas(content.id);
  if (deltas.length === 0) {
    return {
      pmJSON: content.pmJSON,
      nextSeq: 0,
      contentId: content.id,
      selection: content.selection,
    };
  }

  const baseDoc = pmSchema.nodeFromJSON(content.pmJSON);
  const { doc, lastGoodIdx, partialLoad, selection } = replayDeltas(
    baseDoc,
    deltas,
    content.selection,
  );

  return {
    pmJSON: doc.toJSON(),
    nextSeq: lastGoodIdx + 1,
    contentId: content.id,
    selection,
    partialLoad,
  };
}

// ─── Soft Save ────────────────────────────────────────────────

export async function softSave(
  nodeId: string,
  steps: object[],
  selection: { anchor: number; head: number },
  seq: number,
): Promise<void> {
  if (steps.length === 0) return;

  let content = await getSheetContent(nodeId);
  if (!content) {
    const emptyDoc = pmSchema.topNodeType.createAndFill()!;
    content = {
      id: genId(),
      nodeId,
      pmJSON: emptyDoc.toJSON(),
      markdown: '',
      selection: { anchor: 0, head: 0 },
    };
    await updateSheetSnapshotAtomic(content);
  }

  await putSheetDelta({ contentId: content.id, seq, steps, selection });
  console.log('Soft save');
}

// ─── Hard Save ────────────────────────────────────────────────

export interface HardSaveResult {
  markdown: string;
  autoLabel: string;
}

export async function hardSave(
  nodeId: string,
  pmDocJSON?: unknown,
  selection?: { anchor: number; head: number },
): Promise<HardSaveResult> {
  const existing = await getSheetContent(nodeId);

  let finalDoc;
  if (pmDocJSON !== undefined) {
    finalDoc = pmSchema.nodeFromJSON(pmDocJSON);
  } else if (existing) {
    const deltas = await getSheetDeltas(existing.id);
    const baseDoc = pmSchema.nodeFromJSON(existing.pmJSON);
    ({ doc: finalDoc } = replayDeltas(baseDoc, deltas, existing.selection));
  } else {
    finalDoc = pmSchema.topNodeType.createAndFill()!;
  }

  const markdown = docToMarkdown(finalDoc);
  const newId = genId();
  const newContent: SheetContent = {
    id: newId,
    nodeId,
    pmJSON: finalDoc.toJSON(),
    markdown,
    selection: selection ?? { head: 0, anchor: 0 },
  };

  await updateSheetSnapshotAtomic(newContent);
  console.log('Hard save');

  return { markdown, autoLabel: getShortLabel(markdown) };
}

// ─── Sheet Content as Markdown ────────────────────────────────

export async function getSheetContentAsMarkdown(
  nodeId: string,
): Promise<string> {
  const content = await getSheetContent(nodeId);
  if (!content) return '';

  const deltas = await getSheetDeltas(content.id);
  if (deltas.length > 0) {
    const { markdown } = await hardSave(nodeId);
    return markdown;
  }
  return content.markdown;
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

  const newId = genId();
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

  const pmDoc = markdownToDoc(text);
  const sheetContent: SheetContent = {
    id: genId(),
    nodeId: newId,
    pmJSON: pmDoc.toJSON(),
    markdown: text,
    selection: { head: 0, anchor: 0 },
  };

  await createNodeAtomic(sheet, sheetContent);
  return newId;
}

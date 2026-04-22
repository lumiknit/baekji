import { pmSchema, pmParser, pmSerializer } from './pm';
import {
  getSheetDraft,
  getSheetContent,
  putSheetContent,
  deleteSheetDraft,
  getNode,
  getChildren,
  putNode,
  getNewOrderKey,
} from './db';
import type { BakImportResult } from './backup';
import { insertVersion } from './db';
import type { SheetNode } from './v0';
import { genId } from '../uuid';

// ─── Project Creation ─────────────────────────────────────────

export interface NewProjectIds {
  projectId: string;
  pjVerId: string;
}

/**
 * Creates a new project with a single versionRoot node and returns
 * the generated projectId and versionId.
 */
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

// ─── Draft ────────────────────────────────────────────────────

/**
 * Converts a sheet's ProseMirror draft to markdown, persists it as
 * SheetContent, and removes the draft. No-op if no draft exists.
 */
export async function freezeSheetDraft(sheetId: string): Promise<void> {
  const draft = await getSheetDraft(sheetId);
  if (!draft) return;
  try {
    const pmNode = pmSchema.nodeFromJSON(draft.content);
    const markdown = pmSerializer.serialize(pmNode);
    await putSheetContent(sheetId, markdown);
    await deleteSheetDraft(sheetId);
  } catch {
    // Corrupt draft; leave it untouched
  }
}

/** Returns sheet content as ProseMirror JSON. Draft takes priority; falls back to parsing stored markdown. */
export async function getSheetContentAsJSON(sheetId: string): Promise<unknown> {
  const draft = await getSheetDraft(sheetId);
  if (draft?.content) return draft.content;
  const sc = await getSheetContent(sheetId);
  try {
    const doc = pmParser.parse(sc?.content ?? '');
    return doc?.toJSON() ?? pmSchema.topNodeType.createAndFill()!.toJSON();
  } catch {
    return pmSchema.topNodeType.createAndFill()!.toJSON();
  }
}

/** Returns sheet content as markdown. If a draft exists it is frozen (persisted as markdown) first. */
export async function getSheetContentAsMarkdown(
  sheetId: string,
): Promise<string> {
  const draft = await getSheetDraft(sheetId);
  if (draft) {
    await freezeSheetDraft(sheetId);
  }
  const sc = await getSheetContent(sheetId);
  return sc?.content ?? '';
}

// ─── Tree Traversal ───────────────────────────────────────────

/**
 * Recursively collects markdown text from all visible sheets
 * under the given node (group, sheet, or versionRoot).
 */
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

  // Hidden check (versionRoot is never filtered)
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

  // group or versionRoot: recurse into children sorted by orderKey
  const children = await getChildren(nodeId);
  for (const child of children) {
    await walkNode(child.id, includeHidden, parts);
  }
}

// ─── Import ───────────────────────────────────────────────────

/**
 * Atomically writes a prepared BakImportResult to the database.
 * The caller is responsible for checking `result.projectExists` and
 * deciding whether to activate the version before calling this.
 */
export async function commitBakImport(result: BakImportResult): Promise<void> {
  await insertVersion(result.versionRoot, result.nodes, result.sheetContents);
}

// ─── Text Import ──────────────────────────────────────────────

export async function importTextAsSheet(
  text: string,
  label: string,
  pjVerId: string,
  parentId: string,
): Promise<string> {
  const parent = await getNode(parentId);
  if (!parent || parent.type === 'sheet') throw new Error('Invalid parent');

  const newId = genId();
  const orderKey = await getNewOrderKey(parentId);
  const now = new Date().toISOString();

  const sheet: SheetNode = {
    id: newId,
    pjVerId,
    parentId,
    orderKey,
    label: label.replace(/\.[^.]+$/, ''),
    type: 'sheet',
    updatedAt: now,
    visual: { colorH: 0, colorS: 0 },
    tags: [],
  };

  await putNode(sheet);
  await putSheetContent(newId, text);
  return newId;
}

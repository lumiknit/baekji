import { Step } from 'prosemirror-transform';
import { pmSchema, pmParser, pmSerializer } from './pm';
import {
  getSheetContent,
  putSheetContent,
  deleteSheetContent,
  getSheetDeltas,
  putSheetDelta,
  deleteSheetDeltasByContentId,
  getNode,
  getChildren,
  putNode,
  createNodeAtomic,
} from './db';
import type { BakImportResult } from './backup';
import { insertVersion } from './db';
import type { SheetContent, SheetDelta, SheetNode } from './v0';
import { genId } from '../uuid';

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

// ─── Label Extraction ─────────────────────────────────────────

/** Extracts a short label from markdown text (first non-empty line, stripped of heading markers). */
export function getShortLabel(markdown: string): string {
  const firstLine = markdown.split('\n').find((l) => l.trim()) ?? '';
  return firstLine.replace(/^#+\s*/, '').slice(0, 60);
}

// ─── Load Sheet State ─────────────────────────────────────────

export interface SheetState {
  pmJSON: unknown;
  nextSeq: number;
  contentId: string | null;
  selection: { anchor: number; head: number };
}

/**
 * Loads the current sheet state by replaying any pending deltas on top of
 * the last snapshot. Returns the final pmJSON and the next seq number.
 */
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
  if (deltas.length > 0) {
    try {
      let doc = pmSchema.nodeFromJSON(content.pmJSON);
      for (const delta of deltas) {
        for (const stepJSON of delta.steps) {
          const step = Step.fromJSON(pmSchema, stepJSON as any);
          const result = step.apply(doc);
          if (result.doc) doc = result.doc;
        }
      }
      return {
        pmJSON: doc.toJSON(),
        nextSeq: deltas.length,
        contentId: content.id,
        selection: deltas[deltas.length - 1].selection,
      };
    } catch {
      console.error('Failed to load content id', content.id);
    }
  }

  return {
    pmJSON: content.pmJSON,
    nextSeq: 0,
    contentId: content.id,
    selection: content.selection,
  };

  // Replay deltas on top of snapshot
}

// ─── Soft Save ────────────────────────────────────────────────

/**
 * Appends a batch of steps as a new SheetDelta.
 * If no snapshot exists yet, creates an empty one first.
 */
export async function softSave(
  nodeId: string,
  steps: object[],
  selection: { anchor: number; head: number },
  seq: number,
): Promise<void> {
  if (steps.length === 0) return;

  let content = await getSheetContent(nodeId);
  if (!content) {
    // No snapshot yet — create an empty one
    const emptyDoc = pmSchema.topNodeType.createAndFill()!;
    content = {
      id: genId(),
      nodeId,
      pmJSON: emptyDoc.toJSON(),
      markdown: '',
      selection: { anchor: 0, head: 0 },
    };
    await putSheetContent(content);
  }

  const delta: SheetDelta = {
    contentId: content.id,
    seq,
    steps,
    selection,
  };
  await putSheetDelta(delta);
  /*console.log(
    `[softSave] seq=${seq} steps=${steps.length} stepsJSON=${JSON.stringify(steps).length}chars`,
  );*/
  console.log('Soft save');
}

// ─── Hard Save ────────────────────────────────────────────────

export interface HardSaveResult {
  markdown: string;
  autoLabel: string;
}

/**
 * Performs a full snapshot save.
 * - If pmDocJSON is provided (editor open), uses it directly.
 * - Otherwise, replays all pending deltas from the last snapshot.
 * Clears all pending deltas after saving.
 */
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
    finalDoc = pmSchema.nodeFromJSON(existing.pmJSON);
    const deltas = await getSheetDeltas(existing.id);
    for (const delta of deltas) {
      for (const stepJSON of delta.steps) {
        try {
          const step = Step.fromJSON(pmSchema, stepJSON as any);
          const result = step.apply(finalDoc);
          if (result.doc) finalDoc = result.doc;
        } catch {
          // skip corrupt step
        }
      }
    }
  } else {
    finalDoc = pmSchema.topNodeType.createAndFill()!;
  }

  const markdown = pmSerializer.serialize(finalDoc);
  const newId = genId();
  const newContent: SheetContent = {
    id: newId,
    nodeId,
    pmJSON: finalDoc.toJSON(),
    markdown,
    selection: selection || { head: 0, anchor: 0 },
  };

  // Delete old deltas, then replace snapshot
  if (existing) {
    await deleteSheetDeltasByContentId(existing.id);
    await deleteSheetContent(nodeId);
  }
  await putSheetContent(newContent);

  /*console.log(
    `[hardSave] nodeId=${nodeId} contentId=${newId} markdown=${markdown.length}chars pmJSON=${JSON.stringify(newContent.pmJSON).length}chars`,
  );*/
  console.log('Hard save');

  return { markdown, autoLabel: getShortLabel(markdown) };
}

// ─── Sheet Content as Markdown (for export/analysis) ──────────

/**
 * Returns sheet content as markdown, triggering a hard save first if
 * there are pending deltas (so callers always get up-to-date content).
 */
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

  let pmDoc;
  try {
    pmDoc = pmParser.parse(text);
  } catch {
    pmDoc = pmSchema.topNodeType.createAndFill()!;
  }

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

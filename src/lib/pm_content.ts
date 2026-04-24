import { Step } from 'prosemirror-transform';
import type { Node as PmNode } from 'prosemirror-model';
import { pmSchema, pmParser, pmSerializer } from './doc/pm';
import type { SheetDelta } from './doc/v0';

export { pmSchema, pmParser, pmSerializer };

// ─── Label / Text Extraction ──────────────────────────────────

export function getShortLabel(markdown: string): string {
  return markdown
    .replace(/^#+\s*/m, '')
    .trim()
    .slice(0, 200);
}

export function extractDocLabel(doc: PmNode, maxLen = 200): string {
  const size = doc.content.size;
  return doc
    .textBetween(0, Math.min(size, maxLen * 4), ' ')
    .trim()
    .slice(0, maxLen);
}

// ─── Markdown ↔ ProseMirror ───────────────────────────────────

export function markdownToDoc(markdown: string): PmNode {
  try {
    return pmParser.parse(markdown);
  } catch {
    return pmSchema.topNodeType.createAndFill()!;
  }
}

export function docToMarkdown(doc: PmNode): string {
  return pmSerializer.serialize(doc);
}

// ─── Delta Replay ─────────────────────────────────────────────

export interface ReplayResult {
  doc: PmNode;
  partialLoad: boolean;
}

/** Apply a flat list of step JSONs to a doc. Stops on first failure. */
export function replayStepJSONs(
  doc: PmNode,
  stepJSONs: unknown[],
): ReplayResult {
  let current = doc;
  for (const stepJSON of stepJSONs) {
    try {
      const step = Step.fromJSON(pmSchema, stepJSON as any);
      const result = step.apply(current);
      if (result.doc) current = result.doc;
    } catch {
      return { doc: current, partialLoad: true };
    }
  }
  return { doc: current, partialLoad: false };
}

export interface DeltaReplayResult {
  doc: PmNode;
  /** Index of the last successfully applied delta (-1 if none). */
  lastGoodIdx: number;
  partialLoad: boolean;
  selection: { anchor: number; head: number };
}

/** Replay an ordered list of SheetDeltas on top of a base doc. */
export function replayDeltas(
  baseDoc: PmNode,
  deltas: SheetDelta[],
  baseSelection: { anchor: number; head: number },
): DeltaReplayResult {
  let doc = baseDoc;
  let lastGoodIdx = -1;
  let lastSelection = baseSelection;

  for (let i = 0; i < deltas.length; i++) {
    const { steps, selection } = deltas[i];
    const { doc: next, partialLoad } = replayStepJSONs(doc, steps);
    doc = next;
    if (partialLoad) {
      console.error('Delta replay failed at seq', deltas[i].seq);
      return { doc, lastGoodIdx, partialLoad: true, selection: lastSelection };
    }
    lastGoodIdx = i;
    lastSelection = selection;
  }

  return { doc, lastGoodIdx, partialLoad: false, selection: lastSelection };
}

// ─── Stats ────────────────────────────────────────────────────

export interface DocStats {
  chars: number;
  words: number;
}

interface WalkState extends DocStats {
  inWord: boolean;
}

function walkJSON(node: any, s: WalkState): void {
  if (typeof node.text === 'string') {
    for (const ch of node.text as string) {
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        s.inWord = false;
      } else {
        s.chars++;
        if (!s.inWord) {
          s.words++;
          s.inWord = true;
        }
      }
    }
  } else if (Array.isArray(node.content)) {
    for (const child of node.content) walkJSON(child, s);
  }
}

export function calcStats(docJSON: unknown): DocStats {
  const s: WalkState = { chars: 0, words: 0, inWord: false };
  walkJSON(docJSON, s);
  return { chars: s.chars, words: s.words };
}

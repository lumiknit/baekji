import welcomeMd from './welcome.md?raw';
import editorMd from './editor.md?raw';
import structureMd from './structure.md?raw';
import customizeMd from './customize.md?raw';
import notesMd from './notes.md?raw';

import { createNodeAtomic, ORDER_GAP, putNode } from '../lib/doc/db';
import { hardSave } from '../lib/doc/db_helper';
import { markdownToDoc } from '../lib/pm_content';
import { genId } from '../lib/uuid';

interface NodeSpec {
  type: 'group' | 'sheet';
  label: string;
  markdown?: string;
  children?: NodeSpec[];
}

const WELCOME_TREE: NodeSpec[] = [
  { type: 'sheet', label: 'Welcome', markdown: welcomeMd },
  {
    type: 'group',
    label: 'How to use?',
    children: [
      { type: 'sheet', label: 'Editor', markdown: editorMd },
      {
        type: 'sheet',
        label: 'Projects, Groups & Sheets',
        markdown: structureMd,
      },
      { type: 'sheet', label: 'Customize', markdown: customizeMd },
    ],
  },
  { type: 'sheet', label: 'Notes', markdown: notesMd },
];

/** Returns the ID of the first sheet created. */
export async function createWelcomeProject(): Promise<{
  pjVerId: string;
  firstSheetId: string;
}> {
  const projectId = genId();
  const pjVerId = genId();
  const now = new Date().toISOString();

  await putNode({
    id: pjVerId,
    projectId,
    label: 'Welcome to Baekji',
    type: 'versionRoot',
    active: true,
    updatedAt: now,
  });

  let firstSheetId: string | null = null;
  let orderKey = ORDER_GAP;

  async function buildNodes(specs: NodeSpec[], parentId: string) {
    for (const spec of specs) {
      const id = genId();

      if (spec.type === 'group') {
        await createNodeAtomic({
          id,
          pjVerId,
          parentId,
          label: spec.label,
          type: 'group',
          updatedAt: now,
          orderKey: orderKey++,
          visual: { colorH: 0, colorS: 0 },
          tags: [],
        });
        if (spec.children) await buildNodes(spec.children, id);
      } else {
        await createNodeAtomic(
          {
            id,
            pjVerId,
            parentId,
            label: spec.label,
            type: 'sheet',
            updatedAt: now,
            orderKey: orderKey++,
            visual: { colorH: 0, colorS: 0 },
            tags: [],
          },
          {
            id: genId(),
            nodeId: id,
            pmJSON: {},
            markdown: '',
            selection: { anchor: 0, head: 0 },
          },
        );
        if (spec.markdown) {
          const doc = markdownToDoc(spec.markdown);
          await hardSave(id, doc.toJSON(), { anchor: 0, head: 0 });
        }
        if (!firstSheetId) firstSheetId = id;
      }
    }
  }

  await buildNodes(WELCOME_TREE, pjVerId);

  return { pjVerId, firstSheetId: firstSheetId! };
}

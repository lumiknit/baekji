import type {
  BakProject,
  BakNode,
  GroupNode,
  SheetNode,
  SheetContent,
  docVersionRootSchema,
} from './v0';
import { z } from 'zod/v4';
import { bakProjectSchema } from './v0';
import { getVersionRoots, getAllNodesInVersion, getNode } from './db';
import { genUnorderedId } from '../uuid';
import { getSheetContentAsMarkdown } from './db_helper';

type VersionRootNode = z.infer<typeof docVersionRootSchema>;
type DataNode = GroupNode | SheetNode;
type BakGroupNode = Extract<BakNode, { type: 'group' }>;
type BakSheetNode = Extract<BakNode, { type: 'sheet' }>;

// ─── Doc → Backup ────────────────────────────────────────────

export async function exportVersionAsBak(
  versionId: string,
  appVersion: string,
  deviceId: string,
): Promise<BakProject> {
  const versionRoot = await getNode(versionId);
  if (!versionRoot || versionRoot.type !== 'versionRoot') {
    throw new Error(`Version root not found: ${versionId}`);
  }
  const root = versionRoot;

  const dataNodes = await getAllNodesInVersion(versionId);

  // Remap IDs to sequential indices (no UUID needed in backup)
  const allSources: Array<{ id: string }> = [root, ...dataNodes];
  const idMap: Record<string, string> = {};
  allSources.forEach((node, i) => {
    idMap[node.id] = String(i);
  });

  // Build children map (parentId → sorted children)
  const childrenMap = new Map<string, DataNode[]>();
  for (const node of dataNodes) {
    const siblings = childrenMap.get(node.parentId) ?? [];
    siblings.push(node);
    childrenMap.set(node.parentId, siblings);
  }
  for (const siblings of childrenMap.values()) {
    siblings.sort((a, b) => a.orderKey - b.orderKey);
  }

  const bakNodes: Array<BakGroupNode | BakSheetNode> = [];

  // versionRoot → group
  const rootChildren = childrenMap.get(root.id) ?? [];
  bakNodes.push({
    id: idMap[root.id],
    label: root.label,
    updatedAt: root.updatedAt,
    type: 'group',
    children: rootChildren.map((c) => idMap[c.id]),
  } satisfies BakGroupNode);

  // data nodes
  for (const node of dataNodes) {
    const remapped = idMap[node.id];
    if (node.type === 'group') {
      const nodeChildren = childrenMap.get(node.id) ?? [];
      bakNodes.push({
        id: remapped,
        label: node.label,
        updatedAt: node.updatedAt,
        type: 'group',
        children: nodeChildren.map((c) => idMap[c.id]),
      } satisfies BakGroupNode);
    } else {
      const sc = await getSheetContentAsMarkdown(node.id);
      bakNodes.push({
        id: remapped,
        label: node.label,
        updatedAt: node.updatedAt,
        type: 'sheet',
        content: sc,
      } satisfies BakSheetNode);
    }
  }

  const now = new Date().toISOString();
  return {
    $appVersion: appVersion,
    $schemaVersion: 0,
    $projectId: root.projectId,
    label: root.label,
    updatedAt: root.updatedAt,
    exportedAt: now,
    exportedBy: deviceId,
    nodes: bakNodes,
    rootNodeId: idMap[root.id],
  };
}

// ─── Backup → Doc ────────────────────────────────────────────

export function parseBak(raw: unknown): BakProject {
  return bakProjectSchema.parse(raw);
}

export interface BakImportResult {
  projectId: string;
  projectExists: boolean;
  versionRoot: VersionRootNode;
  nodes: DataNode[];
  sheetContents: SheetContent[];
  idMap: Record<string, string>; // bak node ID → new DocNode ID
}

export async function prepareBakImport(
  bak: BakProject,
): Promise<BakImportResult> {
  const existingRoots = await getVersionRoots(bak.$projectId);
  const projectExists = existingRoots.length > 0;

  // Remap all bak node IDs to fresh genId values
  const idMap: Record<string, string> = {};
  for (const node of bak.nodes) {
    idMap[node.id] = genUnorderedId();
  }

  const newVersionId = idMap[bak.rootNodeId];
  const projectId = bak.$projectId;

  const bakNodeMap = new Map<string, (typeof bak.nodes)[number]>();
  for (const node of bak.nodes) {
    bakNodeMap.set(node.id, node);
  }

  const ORDER_GAP = 1024;
  const nodes: DataNode[] = [];
  const sheetContents: SheetContent[] = [];

  function processChildren(bakGroupId: string, parentId: string): void {
    const bakNode = bakNodeMap.get(bakGroupId);
    if (!bakNode || bakNode.type !== 'group') return;

    for (let i = 0; i < bakNode.children.length; i++) {
      const childBakId = bakNode.children[i];
      const child = bakNodeMap.get(childBakId);
      if (!child) continue;

      const newId = idMap[childBakId];
      const orderKey = (i + 1) * ORDER_GAP;

      if (child.type === 'group') {
        nodes.push({
          id: newId,
          pjVerId: newVersionId,
          label: child.label,
          updatedAt: child.updatedAt,
          parentId,
          orderKey,
          type: 'group',
          visual: { colorH: 0, colorS: 0 },
          tags: [],
        } satisfies GroupNode);
        processChildren(childBakId, newId);
      } else {
        nodes.push({
          id: newId,
          pjVerId: newVersionId,
          label: child.label,
          updatedAt: child.updatedAt,
          parentId,
          orderKey,
          type: 'sheet',
          visual: { colorH: 0, colorS: 0 },
          tags: [],
        } satisfies SheetNode);
        sheetContents.push({
          id: genUnorderedId(),
          nodeId: newId,
          markdown: child.content,
          selection: { head: 0, anchor: 0 },
        } satisfies SheetContent);
      }
    }
  }

  processChildren(bak.rootNodeId, newVersionId);

  const rootBakNode = bakNodeMap.get(bak.rootNodeId);
  const versionRoot: VersionRootNode = {
    id: newVersionId,
    projectId,
    label: rootBakNode?.label ?? bak.label,
    updatedAt: rootBakNode?.updatedAt ?? bak.updatedAt,
    type: 'versionRoot',
    active: !projectExists,
    exportedAt: bak.exportedAt,
    exportedBy: bak.exportedBy,
  };

  return { projectId, projectExists, versionRoot, nodes, sheetContents, idMap };
}

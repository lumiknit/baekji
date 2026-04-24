import { createContext } from 'solid-js';
import type { MoveTarget } from '../../state/project_tree';

export type SidebarMode = 'normal' | 'color';

export interface TreeCtx {
  mode: () => SidebarMode;
  draggingId: () => string | null;
  dropTarget: () => MoveTarget | null;
  startDrag: (itemId: string, parentId: string, e: PointerEvent) => void;
  selectedIds: () => Set<string>;
  toggleSelect: (id: string, shift: boolean, parentId: string) => void;
  clearSelection: () => void;
}

export const TreeCtxKey = createContext<TreeCtx>();

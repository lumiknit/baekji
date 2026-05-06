import { createSignal } from 'solid-js';
import type { MoveTarget } from '../../state/project_tree';
import { moveTreeNode, moveTreeNodes } from '../../state/project_tree';

export function calcDropTarget(
  e: PointerEvent,
  draggingId: string | null,
): MoveTarget | null {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (!el) return null;
  const row = (el as HTMLElement).closest(
    '[data-item-id]',
  ) as HTMLElement | null;
  if (!row) return null;
  const itemId = row.dataset.itemId!;
  const parentId = row.dataset.parentId!;
  const isGroup = row.dataset.itemType === 'group';
  if (itemId === draggingId) return null;
  const rect = row.getBoundingClientRect();
  const relY = (e.clientY - rect.top) / rect.height;
  if (isGroup) {
    if (relY < 0.25) return { kind: 'before', itemId, parentId };
    if (relY > 0.75) return { kind: 'after', itemId, parentId };
    return { kind: 'into', groupId: itemId };
  }
  return relY < 0.5
    ? { kind: 'before', itemId, parentId }
    : { kind: 'after', itemId, parentId };
}

export function useDragDrop(
  selectedIds: () => Set<string>,
  selectedParents: Map<string, string>,
) {
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  const [dropTarget, setDropTarget] = createSignal<MoveTarget | null>(null);

  const startDrag = (itemId: string, parentId: string, e: PointerEvent) => {
    let dragStarted = false;
    let longPressTimer: ReturnType<typeof setTimeout> | undefined;
    const target = e.currentTarget as HTMLElement;

    const onTouchMove = (te: TouchEvent) => {
      if (dragStarted && te.cancelable) te.preventDefault();
    };

    const cleanup = () => {
      stopAutoScroll();
      clearTimeout(longPressTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchmove', onTouchMove, { capture: true });
      if (target.hasPointerCapture(e.pointerId)) {
        target.releasePointerCapture(e.pointerId);
      }
    };

    const MOUSE_THRESHOLD = 8;
    const TOUCH_CANCEL_THRESHOLD = 10;

    let scrollTimer: number | null = null;
    let lastClientY = 0;
    let lastClientX = 0;

    const stopAutoScroll = () => {
      if (scrollTimer !== null) {
        cancelAnimationFrame(scrollTimer);
        scrollTimer = null;
      }
    };

    const autoScrollLoop = () => {
      if (!dragStarted) {
        stopAutoScroll();
        return;
      }
      const container = document.querySelector('.tree-view');
      if (!container) {
        stopAutoScroll();
        return;
      }
      const rect = container.getBoundingClientRect();
      const margin = 50;
      const maxSpeed = 12;

      let speed = 0;
      if (lastClientY < rect.top + margin) {
        speed = -maxSpeed * (1 - Math.max(0, lastClientY - rect.top) / margin);
      } else if (lastClientY > rect.bottom - margin) {
        speed =
          maxSpeed * (1 - Math.max(0, rect.bottom - lastClientY) / margin);
      }

      if (speed !== 0) {
        container.scrollTop += speed;
        const fakeEvent = {
          clientX: lastClientX,
          clientY: lastClientY,
        } as PointerEvent;
        setDropTarget(calcDropTarget(fakeEvent, itemId));
        scrollTimer = requestAnimationFrame(autoScrollLoop);
      } else {
        scrollTimer = null;
      }
    };

    const onMove = (me: PointerEvent) => {
      if (!dragStarted && me.pointerType === 'mouse') {
        const dx = Math.abs(me.clientX - e.clientX);
        const dy = Math.abs(me.clientY - e.clientY);
        if (dx > MOUSE_THRESHOLD || dy > MOUSE_THRESHOLD) {
          dragStarted = true;
          setDraggingId(itemId);
          target.setPointerCapture(e.pointerId);
        }
      }
      lastClientX = me.clientX;
      lastClientY = me.clientY;

      if (dragStarted) {
        setDropTarget(calcDropTarget(me, itemId));
        if (!scrollTimer) {
          scrollTimer = requestAnimationFrame(autoScrollLoop);
        }
      } else if (me.pointerType !== 'mouse') {
        if (
          Math.abs(me.clientX - e.clientX) > TOUCH_CANCEL_THRESHOLD ||
          Math.abs(me.clientY - e.clientY) > TOUCH_CANCEL_THRESHOLD
        ) {
          cleanup();
        }
      }
    };

    const onUp = async () => {
      cleanup();
      if (dragStarted) {
        const dt = dropTarget();
        try {
          if (dt) {
            const sel = selectedIds();
            if (sel.size > 1 && sel.has(itemId)) {
              const items = [...sel].map((id) => ({
                itemId: id,
                parentId: selectedParents.get(id) ?? parentId,
              }));
              await moveTreeNodes(items, dt);
            } else {
              await moveTreeNode(itemId, parentId, dt);
            }
          }
        } finally {
          setDraggingId(null);
          setDropTarget(null);
        }
      }
    };

    if (e.pointerType !== 'mouse') {
      longPressTimer = setTimeout(() => {
        dragStarted = true;
        setDraggingId(itemId);
        target.setPointerCapture(e.pointerId);
        if ('vibrate' in navigator) navigator.vibrate(20);
      }, 350);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('touchmove', onTouchMove, {
      passive: false,
      capture: true,
    });
  };

  return { draggingId, dropTarget, startDrag };
}

import type { Accessor, Component, JSX } from 'solid-js';
import { createEffect, createSignal, For, on, onCleanup, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { TbOutlineCheck } from 'solid-icons/tb';

export type DropdownItem =
  | {
      icon?: Component;
      label: string;
      danger?: boolean;
      checked?: boolean;
      onSelect: () => void;
    }
  | { separator: true };

interface DropdownProps {
  trigger: JSX.Element;
  items: DropdownItem[];
  title?: string;
  class?: string;
  triggerClass?: string;
  triggerAriaLabel?: string;
  align?: 'left' | 'right';
  direction?: 'up' | 'down';
  open?: Accessor<boolean>;
  onOpenChange?: (v: boolean) => void;
}

const Dropdown: Component<DropdownProps> = (props) => {
  const [internalOpen, setInternalOpen] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;
  let menuRef: HTMLDivElement | undefined;

  const isControlled = () => props.open !== undefined;
  const open = () => (isControlled() ? props.open!() : internalOpen());
  const setOpen = (v: boolean) => {
    if (isControlled()) props.onOpenChange?.(v);
    else setInternalOpen(v);
  };

  const close = () => setOpen(false);

  const toggle = () => setOpen(!open());

  // Track pointer movement to distinguish tap from scroll.
  // Only close on pointerup if the pointer hasn't moved significantly.
  let downX = 0;
  let downY = 0;

  const handleOutsideDown = (e: PointerEvent) => {
    if (open() && containerRef && !containerRef.contains(e.target as Node)) {
      downX = e.clientX;
      downY = e.clientY;
    }
  };

  const handleOutsideUp = (e: PointerEvent) => {
    if (!open() || !containerRef || containerRef.contains(e.target as Node))
      return;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    if (dx * dx + dy * dy > 100) return; // scrolled, ignore
    e.stopPropagation();
    close();
  };

  createEffect(
    on(open, (isOpen) => {
      if (isOpen) menuRef?.scrollIntoView({ block: 'nearest' });
    }),
  );

  createEffect(() => {
    if (open()) {
      document.addEventListener('pointerdown', handleOutsideDown, {
        capture: true,
      });
      document.addEventListener('pointerup', handleOutsideUp, {
        capture: true,
      });
    } else {
      document.removeEventListener('pointerdown', handleOutsideDown, {
        capture: true,
      });
      document.removeEventListener('pointerup', handleOutsideUp, {
        capture: true,
      });
    }
  });
  onCleanup(() => {
    document.removeEventListener('pointerdown', handleOutsideDown, {
      capture: true,
    });
    document.removeEventListener('pointerup', handleOutsideUp, {
      capture: true,
    });
  });

  return (
    <div
      class={`dropdown ${props.class || ''}`}
      ref={(el) => (containerRef = el)}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        class={props.triggerClass ?? ''}
        onClick={toggle}
        title={props.title}
        aria-label={props.triggerAriaLabel}
      >
        {props.trigger}
      </button>
      <Show when={open()}>
        <div
          class={`dropdown-menu ${props.align === 'right' ? 'dropdown-menu--right' : ''} ${props.direction === 'up' ? 'dropdown-menu--up' : ''}`}
          ref={(el) => (menuRef = el)}
        >
          <For each={props.items}>
            {(item) =>
              'separator' in item ? (
                <div class="dropdown-separator" />
              ) : (
                <button
                  class={`dropdown-item${item.danger ? ' dropdown-item--danger' : ''}`}
                  onClick={() => {
                    item.onSelect();
                    close();
                  }}
                >
                  <Show when={item.icon}>
                    <span class="icon">
                      <Dynamic component={item.icon} />
                    </span>
                  </Show>
                  {item.label}
                  <Show when={item.checked !== undefined}>
                    <span class="icon dropdown-item-check">
                      <Show when={item.checked}>
                        <TbOutlineCheck />
                      </Show>
                    </span>
                  </Show>
                </button>
              )
            }
          </For>
        </div>
      </Show>
    </div>
  );
};

export default Dropdown;

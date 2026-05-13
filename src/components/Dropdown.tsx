import type { Accessor, Component, JSX } from 'solid-js';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';

export type DropdownItem =
  | { icon?: Component; label: string; danger?: boolean; onSelect: () => void }
  | { separator: true };

interface DropdownProps {
  trigger: JSX.Element;
  items: DropdownItem[];
  title?: string;
  class?: string;
  triggerClass?: string;
  triggerAriaLabel?: string;
  align?: 'left' | 'right';
  open?: Accessor<boolean>;
  onOpenChange?: (v: boolean) => void;
}

const Dropdown: Component<DropdownProps> = (props) => {
  const [internalOpen, setInternalOpen] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  const isControlled = () => props.open !== undefined;
  const open = () => (isControlled() ? props.open!() : internalOpen());
  const setOpen = (v: boolean) => {
    if (isControlled()) props.onOpenChange?.(v);
    else setInternalOpen(v);
  };

  const close = () => setOpen(false);

  const toggle = () => setOpen(!open());

  const handleOutsideClick = (e: MouseEvent) => {
    if (open() && containerRef && !containerRef.contains(e.target as Node)) {
      close();
    }
  };

  document.addEventListener('mousedown', handleOutsideClick, { capture: true });
  onCleanup(() =>
    document.removeEventListener('mousedown', handleOutsideClick, {
      capture: true,
    }),
  );

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
          class={`dropdown-menu ${props.align === 'right' ? 'dropdown-menu--right' : ''}`}
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

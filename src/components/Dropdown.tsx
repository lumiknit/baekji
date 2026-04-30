import type { Accessor, Component, JSX } from 'solid-js';
import { createSignal, For, onCleanup, Show } from 'solid-js';

export type DropdownItem =
  | { label: string | JSX.Element; onSelect: () => void }
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

  const handleOutsideClick = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      close();
    }
  };

  const close = () => setOpen(false);

  const toggle = () => setOpen(!open());

  document.addEventListener('mousedown', handleOutsideClick);
  onCleanup(() =>
    document.removeEventListener('mousedown', handleOutsideClick),
  );

  // Stop propagation so tree-row's drag handler doesn't intercept pointer events
  const stopProp = (e: Event) => e.stopPropagation();

  return (
    <div
      class={`dropdown ${props.class || ''}`}
      ref={containerRef}
      onPointerDown={stopProp}
      onClick={stopProp}
    >
      <button
        class={`dropdown-trigger${props.triggerClass ? ` ${props.triggerClass}` : ''}`}
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
                  class="dropdown-item"
                  onClick={() => {
                    item.onSelect();
                    close();
                  }}
                >
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

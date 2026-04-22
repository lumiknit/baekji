import type { Component, JSX } from 'solid-js';
import { createSignal, For, onCleanup, Show } from 'solid-js';

export interface DropdownItem {
  label: string | JSX.Element;
  onSelect: () => void;
}

interface DropdownProps {
  trigger: JSX.Element;
  items: DropdownItem[];
  title?: string;
  class?: string;
  align?: 'left' | 'right';
}

const Dropdown: Component<DropdownProps> = (props) => {
  const [open, setOpen] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  const handleOutsideClick = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      close();
    }
  };

  const close = () => {
    setOpen(false);
    document.removeEventListener('mousedown', handleOutsideClick);
  };

  const toggle = () => {
    if (!open()) {
      document.addEventListener('mousedown', handleOutsideClick);
    } else {
      document.removeEventListener('mousedown', handleOutsideClick);
    }
    setOpen(!open());
  };

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
      <button class="dropdown-trigger" onClick={toggle} title={props.title}>
        {props.trigger}
      </button>
      <Show when={open()}>
        <div
          class={`dropdown-menu ${props.align === 'right' ? 'dropdown-menu--right' : ''}`}
        >
          <For each={props.items}>
            {(item) => (
              <button
                class="dropdown-item"
                onClick={() => {
                  item.onSelect();
                  close();
                }}
              >
                {item.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default Dropdown;

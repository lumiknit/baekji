import {
  createSignal,
  For,
  Show,
  type Accessor,
  type Component,
} from 'solid-js';
import { tagToHsl } from '../../lib/tag/color';

interface TagListProps {
  tags: Accessor<string[]> | string[];
  onTagClick?: (tag: string) => void;
  /** Max tags shown before "…" button. Default: 3. 0 = show all. */
  max?: number;
}

const TagList: Component<TagListProps> = (props) => {
  const [expanded, setExpanded] = createSignal(false);

  const tags = () =>
    typeof props.tags === 'function' ? props.tags() : props.tags;

  const max = () => (props.max === undefined ? 3 : props.max);

  const visible = () => {
    const all = tags();
    if (max() === 0 || expanded() || all.length <= max()) return all;
    return all.slice(0, max());
  };

  const hasMore = () => max() > 0 && !expanded() && tags().length > max();

  const renderTag = (tag: string) => {
    const { h, s } = tagToHsl(tag);
    return (
      <span
        class={`tag${props.onTagClick ? ' tag--clickable' : ''}`}
        style={{
          background: `hsl(${h}deg ${s}% 60% / 0.25)`,
          color: `hsl(${h}deg ${s}% var(--color-l))`,
        }}
        onClick={() => props.onTagClick?.(tag)}
      >
        {tag}
      </span>
    );
  };

  return (
    <div class="tag-list">
      <For each={visible()}>{(tag) => renderTag(tag)}</For>
      <Show when={hasMore()}>
        <button
          class="tag tag--more"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
        >
          +{tags().length - max()}
        </button>
      </Show>
    </div>
  );
};

export default TagList;

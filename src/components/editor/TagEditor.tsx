import {
  createSignal,
  For,
  Show,
  type Component,
  type Accessor,
} from 'solid-js';
import { tagToHsl } from '../../lib/tag/color';
import { canonicalTag, isValidTag } from '../../lib/tag/query';
import { s } from '../../lib/i18n';
import { allTags } from '../../state/sheet_list';

interface TagEditorProps {
  tags: Accessor<string[]>;
  onSave?: (tags: string[]) => void;
  onCancel?: () => void;
  onUpdate?: (tags: string[]) => void;
}

const TagChip: Component<{
  tag: string;
  removable?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
}> = (props) => {
  const { h, s: sat } = tagToHsl(props.tag);
  return (
    <span
      class={`tag${props.removable ? ' tag--removable' : ''}`}
      style={{
        background: `hsl(${h}deg ${sat}% 60% / 0.25)`,
        color: `hsl(${h}deg ${sat}% var(--color-l))`,
        cursor: props.removable || props.onClick ? 'pointer' : undefined,
      }}
      onClick={() => {
        if (props.removable) props.onRemove?.();
        else props.onClick?.();
      }}
      title={props.removable ? s('sheet.remove_tag') : props.tag}
    >
      {props.tag}
      <Show when={props.removable}>
        {' '}
        <span class="tag-del">×</span>
      </Show>
    </span>
  );
};

const TagEditor: Component<TagEditorProps> = (props) => {
  const [editedTags, setEditedTags] = createSignal<string[]>([...props.tags()]);
  const [input, setInput] = createSignal('');
  let inputRef: HTMLInputElement | undefined;

  const isInputValid = () => {
    const v = input().trim();
    if (!v) return true;
    return isValidTag(canonicalTag(v));
  };

  const suggestions = () => {
    const q = input().toLowerCase();
    const current = new Set(editedTags());
    return allTags()
      .filter(
        (t) => !current.has(t) && (q === '' || t.toLowerCase().includes(q)),
      )
      .slice(0, 10);
  };

  const addTag = (raw: string) => {
    const tag = canonicalTag(raw.trim());
    if (!tag || !isValidTag(tag)) return;
    if (editedTags().includes(tag)) {
      setInput('');
      return;
    }
    const next = [...editedTags(), tag];
    setEditedTags(next);
    props.onUpdate?.(next);
    setInput('');
    inputRef?.focus();
  };

  const removeTag = (tag: string) => {
    const next = editedTags().filter((t) => t !== tag);
    setEditedTags(next);
    props.onUpdate?.(next);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(input());
    } else if (e.key === 'Escape') {
      props.onCancel?.();
    }
  };

  const handleSave = () => props.onSave?.(editedTags());
  const handleCancel = () => props.onCancel?.();

  return (
    <div class="tag-editor-v2" onClick={(e) => e.stopPropagation()}>
      {/* Row 1: added tags */}
      <div class="tag-editor-row tag-editor-current">
        <Show
          when={editedTags().length > 0}
          fallback={
            <span class="tag-editor-empty">{s('sheet.edit_tags_prompt')}</span>
          }
        >
          <For each={editedTags()}>
            {(tag) => (
              <TagChip tag={tag} removable onRemove={() => removeTag(tag)} />
            )}
          </For>
          <button
            class="tag tag--more"
            onClick={() => {
              setEditedTags([]);
              props.onUpdate?.([]);
            }}
            title={s('sheet.clear_tags')}
          >
            {s('sheet.clear_tags')}
          </button>
        </Show>
      </div>

      {/* Row 2: suggestions */}
      <div class="tag-editor-row tag-editor-suggestions">
        <span class="tag-editor-label">{s('sheet.tag_suggestions')}:</span>
        <div class="tag-editor-suggestions-list">
          <For each={suggestions()}>
            {(tag) => <TagChip tag={tag} onClick={() => addTag(tag)} />}
          </For>
        </div>
      </div>

      {/* Row 3: input + actions */}
      <div class="tag-editor-row tag-editor-input-row">
        <input
          ref={(el) => (inputRef = el)}
          class={`tag-input${!isInputValid() ? ' tag-input--invalid' : ''}`}
          type="text"
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder={s('editor.add_tag')}
          autofocus
        />
        <button
          class="btn-sm"
          onClick={() => addTag(input())}
          disabled={!input().trim() || !isInputValid()}
        >
          {s('common.add')}
        </button>
        <Show when={props.onSave}>
          <button class="btn-sm btn-primary" onClick={handleSave}>
            {s('common.save')}
          </button>
        </Show>
        <Show when={props.onCancel}>
          <button class="btn-sm" onClick={handleCancel}>
            {s('common.cancel')}
          </button>
        </Show>
      </div>
    </div>
  );
};

export default TagEditor;

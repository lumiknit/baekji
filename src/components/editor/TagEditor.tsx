import {
  createSignal,
  For,
  Show,
  type Component,
  type Accessor,
} from 'solid-js';
import { tagToHsl } from '../../lib/tag/color';
import { isValidTag } from '../../lib/tag/query';
import { s } from '../../lib/i18n';
import { TbOutlineEdit, TbOutlineCheck, TbOutlineX } from 'solid-icons/tb';

interface TagEditorProps {
  tags: Accessor<string[]>;
  onUpdate: (tags: string[]) => void;
}

const TagEditor: Component<TagEditorProps> = (props) => {
  const [isEditing, setIsEditing] = createSignal(false);
  const [editValue, setEditValue] = createSignal('');

  const startEditing = () => {
    setEditValue(props.tags().join(', '));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const saveEditing = () => {
    const newTags = editValue()
      .split(/[,\n]/)
      .map((t) => t.trim().replace(/\s+/g, '_'))
      .filter((t) => t && isValidTag(t));

    // Unique tags
    const uniqueTags = Array.from(new Set(newTags));
    props.onUpdate(uniqueTags);
    setIsEditing(false);
  };

  const removeTag = (tag: string) => {
    props.onUpdate(props.tags().filter((t) => t !== tag));
  };

  return (
    <div class="tag-editor-v2" onClick={(e) => e.stopPropagation()}>
      <Show
        when={isEditing()}
        fallback={
          <div class="tag-list">
            <For each={props.tags()}>
              {(tag) => {
                const { h, s: sat } = tagToHsl(tag);
                return (
                  <span
                    class="tag tag--removable"
                    style={{
                      background: `hsl(${h}deg ${sat}% 60% / 0.25)`,
                      color: `hsl(${h}deg ${sat}% var(--color-l))`,
                    }}
                    onClick={() => removeTag(tag)}
                    title={s('sheet.remove_tag')}
                  >
                    {tag} <span class="tag-del">×</span>
                  </span>
                );
              }}
            </For>
            <button
              class="tag tag--edit"
              onClick={startEditing}
              title={s('common.edit')}
            >
              <TbOutlineEdit />
            </button>
          </div>
        }
      >
        <div class="tag-editor-form">
          <textarea
            class="tag-textarea"
            value={editValue()}
            onInput={(e) => setEditValue(e.currentTarget.value)}
            placeholder={s('sheet.edit_tags_prompt')}
            autofocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                saveEditing();
              }
              if (e.key === 'Escape') {
                cancelEditing();
              }
            }}
          />
          <div class="tag-editor-actions">
            <button
              class="sb-icon-btn"
              onClick={saveEditing}
              title={s('common.save')}
            >
              <TbOutlineCheck />
            </button>
            <button
              class="sb-icon-btn"
              onClick={cancelEditing}
              title={s('common.cancel')}
            >
              <TbOutlineX />
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default TagEditor;

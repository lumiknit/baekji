import type { Component } from 'solid-js';
import { createSignal } from 'solid-js';
import { closeModal } from '../../state/modal';
import TagEditor from '../editor/TagEditor';
import { s } from '../../lib/i18n';

interface Props {
  title: string;
  initialTags: string[];
}

const TagEditModal: Component<Props> = (props) => {
  const [currentTags, setCurrentTags] = createSignal<string[]>(
    props.initialTags,
  );

  return (
    <>
      <h3>{props.title}</h3>
      <div style={{ 'margin-bottom': '1.5rem' }}>
        <TagEditor
          tags={currentTags}
          onUpdate={(tags) => setCurrentTags(tags)}
        />
      </div>
      <div class="modal-actions">
        <button class="btn-primary" onClick={() => closeModal(currentTags())}>
          {s('common.done')}
        </button>
      </div>
    </>
  );
};

export default TagEditModal;

import type { Component } from 'solid-js';
import { createSignal } from 'solid-js';
import { closeModal } from '../../state/modal.ts';
import TagEditor from '../editor/TagEditor.tsx';

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
      <TagEditor
        tags={currentTags}
        onUpdate={(tags) => setCurrentTags(tags)}
        onSave={(tags) => closeModal(tags)}
        onCancel={() => closeModal(null)}
      />
    </>
  );
};

export default TagEditModal;

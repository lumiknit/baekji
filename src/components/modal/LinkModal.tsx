import type { Component } from 'solid-js';
import { createSignal, onMount } from 'solid-js';
import { TbOutlineExternalLink } from 'solid-icons/tb';
import { closeModal, normalizeUrl } from '../../state/modal';
import { s } from '../../lib/i18n';

interface Props {
  defaultValue?: string;
}

const LinkModal: Component<Props> = (props) => {
  const [url, setUrl] = createSignal(props.defaultValue ?? '');
  let inputRef: HTMLInputElement | undefined;

  onMount(() => {
    inputRef?.focus();
    inputRef?.select();
  });

  const handleSave = () => closeModal(normalizeUrl(url()) || null);
  const handleOpen = () => {
    const u = normalizeUrl(url());
    if (u) window.open(u, '_blank', 'noopener,noreferrer');
  };
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') closeModal(null);
  };

  return (
    <>
      <h3>{s('modal.link_title')}</h3>
      <input
        ref={inputRef}
        class="modal-input"
        type="url"
        placeholder="https://"
        value={url()}
        onInput={(e) => setUrl(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
      <div class="modal-actions">
        <button class="btn-secondary" onClick={() => closeModal(null)}>
          {s('common.cancel')}
        </button>
        <button class="btn-secondary" onClick={handleOpen}>
          <TbOutlineExternalLink /> {s('modal.link_open')}
        </button>
        <button class="btn-primary" onClick={handleSave}>
          {s('common.save')}
        </button>
      </div>
    </>
  );
};

export default LinkModal;

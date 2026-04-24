import type { Component } from 'solid-js';
import { createSignal, onMount } from 'solid-js';
import { closeModal, normalizeUrl } from '../../state/modal';
import { s } from '../../lib/i18n';

interface Props {
  src?: string;
  alt?: string;
}

const ImageModal: Component<Props> = (props) => {
  const [src, setSrc] = createSignal(props.src ?? '');
  const [alt, setAlt] = createSignal(props.alt ?? '');
  let srcRef: HTMLInputElement | undefined;

  onMount(() => {
    srcRef?.focus();
    srcRef?.select();
  });

  const handleSave = () => {
    const normalized = normalizeUrl(src());
    if (!normalized) return;
    closeModal({ src: normalized, alt: alt().trim() });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') closeModal(null);
  };

  return (
    <>
      <h3>{s('modal.image_title')}</h3>
      <label class="modal-label">{s('modal.image_url')}</label>
      <input
        ref={srcRef}
        class="modal-input"
        type="url"
        placeholder="https://"
        value={src()}
        onInput={(e) => setSrc(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
      <label class="modal-label">{s('modal.image_alt')}</label>
      <input
        class="modal-input"
        type="text"
        placeholder={s('modal.image_alt_placeholder')}
        value={alt()}
        onInput={(e) => setAlt(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
      <div class="modal-actions">
        <button class="btn-secondary" onClick={() => closeModal(null)}>
          {s('common.cancel')}
        </button>
        <button class="btn-primary" onClick={handleSave}>
          {s('common.save')}
        </button>
      </div>
    </>
  );
};

export default ImageModal;

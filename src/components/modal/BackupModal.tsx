import type { Component } from 'solid-js';
import { createResource, Show } from 'solid-js';
import { exportVersionAsBak } from '../../lib/doc/backup';
import { bakToBlob, serializeBak } from '../../lib/doc/backup_helper';
import {
  downloadBlob,
  sanitizeFilename,
  timestampSuffix,
} from '../../lib/doc/export';
import { s } from '../../lib/i18n';
import { closeModal } from '../../state/modal';
import { deviceId } from '../../state/workspace';

declare const __APP_VERSION__: string;

interface Props {
  pjVerId: string;
  projectLabel: string;
}

const BackupModal: Component<Props> = (props) => {
  const filename = `${sanitizeFilename(props.projectLabel)}_${timestampSuffix()}.gz`;

  // Start generating the blob immediately on mount
  const [blob] = createResource(async () => {
    try {
      const bak = await exportVersionAsBak(
        props.pjVerId,
        __APP_VERSION__,
        deviceId(),
      );
      const data = await serializeBak(bak);
      return bakToBlob(data);
    } catch (err) {
      console.error('Backup blob generation failed:', err);
      throw err;
    }
  });

  const handleShare = async () => {
    const b = blob();
    if (!b) return;
    const file = new File([b], filename, { type: b.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        closeModal(null);
        return;
      } catch (err) {
        console.error('Share failed:', err);
      }
    }
    downloadBlob(b, filename);
    closeModal(null);
  };

  const handleDownload = () => {
    const b = blob();
    if (!b) return;
    downloadBlob(b, filename);
    closeModal(null);
  };

  return (
    <>
      <h3>{s('common.backup_download')}</h3>
      <p class="opacity-60 text-base">{props.projectLabel}</p>
      <div class="modal-actions">
        <button class="btn-secondary" onClick={() => closeModal(null)}>
          {s('common.cancel')}
        </button>
        <button
          class="btn-border"
          disabled={blob.loading}
          onClick={handleDownload}
        >
          <Show when={blob.loading} fallback={s('common.download')}>
            ...
          </Show>
        </button>
        <button
          class="btn-primary"
          disabled={blob.loading}
          onClick={handleShare}
        >
          <Show when={blob.loading} fallback={s('common.share')}>
            ...
          </Show>
        </button>
      </div>
    </>
  );
};

export default BackupModal;

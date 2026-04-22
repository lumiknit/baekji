import type { Component } from 'solid-js';
import { exportVersionAsBak } from '../../lib/doc/backup';
import { bakToBlob, serializeBak } from '../../lib/doc/backup_helper';
import {
  downloadBlob,
  sanitizeFilename,
  shareBlob,
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
  const filename = () =>
    `${sanitizeFilename(props.projectLabel)}_${timestampSuffix()}.gz`;

  const getBlob = async () => {
    const bak = await exportVersionAsBak(
      props.pjVerId,
      __APP_VERSION__,
      deviceId(),
    );
    const data = await serializeBak(bak);
    return bakToBlob(data);
  };

  const handleDownload = async () => {
    downloadBlob(await getBlob(), filename());
    closeModal(null);
  };

  const handleShare = async () => {
    await shareBlob(await getBlob(), filename());
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
        <button class="btn-border" onClick={handleShare}>
          {s('common.share')}
        </button>
        <button class="btn-primary" onClick={handleDownload}>
          {s('common.download')}
        </button>
      </div>
    </>
  );
};

export default BackupModal;

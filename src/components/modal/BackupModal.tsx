import type { Component } from 'solid-js';
import { createSignal, Show } from 'solid-js';
import toast from 'solid-toast';
import {
  exportProjectAsBakV1,
  importBakV1,
  parseBakV1,
} from '../../lib/doc/backup_v1';
import {
  serializeGzip,
  deserializeGzip,
  toBlob,
} from '../../lib/doc/backup_helper';
import {
  activeProjectDoc,
  activeProjectId,
  activeProjectLabel,
  openProject,
} from '../../state/workspace_v1';
import { deviceId } from '../../state/workspace';
import { closeBackupModal } from '../../state/modal';
import { s } from '../../lib/i18n';

declare const __APP_VERSION__: string;

function sanitizeFilename(name: string): string {
  return name.slice(0, 64).replace(/[\x00-\x1f\\/:"*?<>|]/g, '_');
}

function timestampSuffix(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(2);
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${y}${mo}${d}_${h}${m}`;
}

const BackupModal: Component = () => {
  const [exporting, setExporting] = createSignal(false);

  const handleDownload = async () => {
    const pd = activeProjectDoc();
    const id = activeProjectId();
    if (!pd || !id) return;
    setExporting(true);
    try {
      const bak = await exportProjectAsBakV1(
        id,
        pd,
        __APP_VERSION__,
        deviceId(),
      );
      const data = await serializeGzip(bak);
      const blob = toBlob(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeFilename(activeProjectLabel())}_${timestampSuffix()}.bak.gz`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(s('backup.exported'));
      closeBackupModal();
    } catch (err) {
      toast.error(s('backup.export_error'));
    } finally {
      setExporting(false);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gz,.bak';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const raw = await deserializeGzip(file);
        const bak = parseBakV1(raw);
        const result = await importBakV1(bak);
        await openProject(result.projectId);
        toast.success(s('backup.imported'));
        closeBackupModal();
      } catch (err) {
        toast.error(s('backup.import_error'));
      }
    };
    input.click();
  };

  return (
    <div class="flex flex-column gap-8">
      <h3 class="m-0">{s('backup.title')}</h3>
      <Show when={activeProjectDoc()}>
        <p class="hint">{s('backup.export_desc')}</p>
        <button
          class="btn-primary btn-sm"
          disabled={exporting()}
          onClick={handleDownload}
        >
          {exporting() ? s('backup.exporting') : s('backup.export_btn')}
        </button>
        <hr class="separator-line" style={{ margin: '4px 0' }} />
      </Show>
      <p class="hint">{s('backup.import_desc')}</p>
      <button class="btn-border btn-sm" onClick={handleImport}>
        {s('backup.import_btn')}
      </button>
      <div class="modal-actions">
        <button class="btn-secondary" onClick={closeBackupModal}>
          {s('common.cancel')}
        </button>
      </div>
    </div>
  );
};

export default BackupModal;

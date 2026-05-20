import type { Component } from 'solid-js';
import { createSignal } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import toast from 'solid-toast';
import { TbOutlineDownload, TbOutlineUpload } from 'solid-icons/tb';
import {
  exportProjectAsBakV1,
  parseBakV1,
  type ImportStrategy,
} from '../../lib/doc/backup_v1';
import {
  serializeGzip,
  deserializeGzip,
  toBlob,
} from '../../lib/doc/backup_helper';
import { activeProjectId, activeProjectLabel } from '../../state/workspace_v3';
import { deviceId } from '../../state/workspace';
import { closeBackupModal } from '../../state/modal';
import { setLoadTarget } from '../../state/backupLoad';
import { s } from '../../lib/i18n';
import { timestampSuffix } from '../../lib/format';
import type { BakV1 } from '../../lib/doc/v1';

declare const __APP_VERSION__: string;

function sanitizeFilename(name: string): string {
  return name.slice(0, 64).replace(/[ -\\/:"*?<>|]/g, '_');
}

interface Props {
  importStrategy: () => ImportStrategy;
  checkOlderSnapshot: (bak: BakV1) => Promise<boolean>;
}

const LocalBackupSection: Component<Props> = (props) => {
  const navigate = useNavigate();
  const [exporting, setExporting] = createSignal(false);

  const handleDownload = async () => {
    const id = activeProjectId();
    if (!id) return;
    setExporting(true);
    try {
      const bak = await exportProjectAsBakV1(id, __APP_VERSION__, deviceId());
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
    } catch {
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
        if (!(await props.checkOlderSnapshot(bak))) return;
        setLoadTarget({ bak, strategy: props.importStrategy() });
        closeBackupModal();
        navigate('/loading-backup');
      } catch {
        toast.error(s('backup.import_error'));
      }
    };
    input.click();
  };

  return (
    <div class="flex flex-column gap-2">
      <div class="flex items-center gap-2">
        <TbOutlineDownload />
        <h4 class="m-0">Local</h4>
      </div>
      <p class="hint m-0">{s('backup.export_desc')}</p>
      <div class="flex gap-2">
        <button
          class="btn-primary btn-sm flex-1"
          disabled={exporting() || !activeProjectId()}
          onClick={handleDownload}
        >
          <span class="icon">
            <TbOutlineDownload />
          </span>
          {exporting() ? s('backup.exporting') : s('backup.export_btn')}
        </button>
        <button class="btn-border btn-sm flex-1" onClick={handleImport}>
          <span class="icon">
            <TbOutlineUpload />
          </span>
          {s('backup.import_btn')}
        </button>
      </div>
    </div>
  );
};

export default LocalBackupSection;

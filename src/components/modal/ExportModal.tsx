import type { Component } from 'solid-js';
import { createSignal } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import toast from 'solid-toast';
import {
  TbOutlineClipboard,
  TbOutlineDeviceFloppy,
  TbOutlineEye,
  TbOutlinePrinter,
  TbOutlineShare,
} from 'solid-icons/tb';
import { closeModal } from '../../state/modal';
import {
  buildExportBlob,
  downloadBlob,
  shareBlob,
  printExport,
  sanitizeFilename,
  timestampSuffix,
} from '../../lib/doc/export';
import type { ExportFormat } from '../../lib/doc/export';
import { projectTree } from '../../state/project_tree';
import { s } from '../../lib/i18n';
import { logError } from '../../state/log';

interface Props {
  nodeId: string;
}

const ExportModal: Component<Props> = (props) => {
  const navigate = useNavigate();
  const [includeHidden, setIncludeHidden] = createSignal(false);
  const [format, setFormat] = createSignal<ExportFormat>('md');
  const [busy, setBusy] = createSignal(false);

  const label = () => {
    const isRoot = props.nodeId === projectTree.meta?.pjVerId;
    if (isRoot) return projectTree.meta?.label || 'export';
    return (
      projectTree.nodes[props.nodeId]?.label ||
      projectTree.meta?.label ||
      'export'
    );
  };

  const getBlob = () =>
    buildExportBlob(props.nodeId, format(), includeHidden());

  const wrap = (fn: () => Promise<void>) => async () => {
    if (busy()) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      logError('ExportModal', err);
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = wrap(async () => {
    const { blob, ext } = await getBlob();
    downloadBlob(
      blob,
      `${sanitizeFilename(label())}_${timestampSuffix()}.${ext}`,
    );
    closeModal(null);
  });

  const handleShare = wrap(async () => {
    const { blob, ext } = await getBlob();
    await shareBlob(
      blob,
      `${sanitizeFilename(label())}_${timestampSuffix()}.${ext}`,
    );
    closeModal(null);
  });

  const handlePreview = () => {
    navigate(`/nodes/${props.nodeId}/preview`);
    closeModal(null);
  };

  const handlePrint = wrap(async () => {
    await printExport(props.nodeId, includeHidden());
    closeModal(null);
  });

  const handleCopy = wrap(async () => {
    const { blob } = await getBlob();
    const text = await blob.text();
    await navigator.clipboard.writeText(text);
    closeModal(null);
  });

  return (
    <>
      <h3>{s('common.export')}</h3>
      <div class="flex flex-column gap-16">
        <label class="flex items-center gap-8">
          <input
            type="checkbox"
            checked={includeHidden()}
            onChange={(e) => setIncludeHidden(e.currentTarget.checked)}
          />
          {s('modal.include_hidden')}
        </label>

        <div class="flex items-center gap-8">
          {s('modal.format')}:
          <select
            value={format()}
            onChange={(e) => setFormat(e.currentTarget.value as ExportFormat)}
          >
            <option value="md">Markdown</option>
            <option value="txt">Plain Text</option>
            <option value="html">HTML</option>
          </select>
        </div>
      </div>

      <div class="flex gap-8 justify-end">
        <button
          class="btn-border"
          onClick={handlePreview}
          title={s('stats.preview')}
        >
          <span class="icon">
            <TbOutlineEye />
          </span>
        </button>
        <button
          class="btn-border"
          disabled={busy()}
          onClick={handleCopy}
          title={s('common.copy')}
        >
          <span class="icon">
            <TbOutlineClipboard />
          </span>
        </button>
        <button
          class="btn-border"
          disabled={busy()}
          onClick={handlePrint}
          title="Print"
        >
          <span class="icon">
            <TbOutlinePrinter />
          </span>
        </button>
        <button
          class="btn-border"
          disabled={busy()}
          onClick={handleShare}
          title={s('common.share')}
        >
          <span class="icon">
            <TbOutlineShare />
          </span>
        </button>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" onClick={() => closeModal(null)}>
          {s('common.cancel')}
        </button>
        <button class="btn-primary" disabled={busy()} onClick={handleDownload}>
          <span class="icon">
            <TbOutlineDeviceFloppy />
          </span>{' '}
          {s('common.download')}
        </button>
      </div>
    </>
  );
};

export default ExportModal;

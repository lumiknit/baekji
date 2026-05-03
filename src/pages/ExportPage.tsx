import type { Component } from 'solid-js';
import { createSignal, createResource, Show } from 'solid-js';
import { useParams, A } from '@solidjs/router';
import toast from 'solid-toast';
import {
  TbOutlineClipboard,
  TbOutlineDeviceFloppy,
  TbOutlinePrinter,
  TbOutlineShare,
  TbOutlineCopy,
} from 'solid-icons/tb';
import {
  buildExportBlob,
  downloadBlob,
  shareBlob,
  printExport,
  sanitizeFilename,
  timestampSuffix,
} from '../lib/doc/export';
import type { ExportFormat } from '../lib/doc/export';
import { projectTree } from '../state/project_tree';
import { s } from '../lib/i18n';
import { logError } from '../state/log';
import { collectText } from '../lib/doc/db_helper';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import BreadCrumb from '../components/BreadCrumb';
import { setActivePjVerId } from '../state/workspace';
import { getNode } from '../lib/doc/db';

const mdit = new MarkdownIt({ html: false, linkify: true, typographer: true });

const ExportPage: Component = () => {
  const params = useParams();
  const nodeId = () => params.id ?? '';

  const [includeHidden, setIncludeHidden] = createSignal(false);
  const [format, setFormat] = createSignal<ExportFormat>('md');
  const [busy, setBusy] = createSignal(false);

  // Fetch all text content asynchronously
  const [rawText] = createResource(
    () => ({ id: nodeId(), hidden: includeHidden() }),
    async ({ id, hidden }) => {
      if (!id) return '';
      const node = await getNode(id);
      if (node.type === 'versionRoot') setActivePjVerId(node.id);
      else setActivePjVerId(node.pjVerId);
      return await collectText(id, hidden);
    },
  );

  const label = () => {
    const isRoot = nodeId() === projectTree.meta?.pjVerId;
    if (isRoot) return projectTree.meta?.label || 'export';
    return (
      projectTree.nodes[nodeId()]?.label || projectTree.meta?.label || 'export'
    );
  };

  const getBlob = () => buildExportBlob(nodeId(), format(), includeHidden());

  const wrap = (fn: () => Promise<void>) => async () => {
    if (busy()) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      logError('ExportPage', err);
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
  });

  const handleShare = wrap(async () => {
    const { blob, ext } = await getBlob();
    await shareBlob(
      blob,
      `${sanitizeFilename(label())}_${timestampSuffix()}.${ext}`,
    );
  });

  const handlePrint = wrap(async () => {
    await printExport(nodeId(), includeHidden());
  });

  const handleCopyPlain = wrap(async () => {
    const { blob } = await buildExportBlob(nodeId(), 'txt', includeHidden());
    const text = await blob.text();
    await navigator.clipboard.writeText(text);
    toast.success(s('common.copied') || 'Copied');
  });

  const handleCopyHtml = wrap(async () => {
    const text = rawText() || '';
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${DOMPurify.sanitize(mdit.render(text))}</body></html>`;
    const { blob: plainBlob } = await buildExportBlob(
      nodeId(),
      'txt',
      includeHidden(),
    );
    const plain = await plainBlob.text();

    try {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      toast.success(s('common.copied') || 'Copied');
    } catch (err) {
      // Fallback
      await navigator.clipboard.writeText(plain);
      toast.success(s('common.copied') || 'Copied (Plain Text)');
    }
  });

  return (
    <div class="p-16 mt-32 max-w-720 m-auto flex flex-column gap-16">
      <div class="flex items-center justify-between">
        <BreadCrumb nodeId={nodeId()} />
      </div>

      <div class="flex flex-column gap-16">
        <h3 class="m-0">{s('common.export')}</h3>

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

        <div class="flex gap-8 flex-wrap">
          <button
            class="btn-border"
            disabled={busy()}
            onClick={handleCopyPlain}
            title={s('common.copy_plain') || 'Copy Plain Text'}
          >
            <span class="icon">
              <TbOutlineClipboard />
            </span>
            {s('common.copy_plain') || 'Copy Plain Text'}
          </button>
          <button
            class="btn-border"
            disabled={busy()}
            onClick={handleCopyHtml}
            title={s('common.copy_html') || 'Copy HTML'}
          >
            <span class="icon">
              <TbOutlineCopy />
            </span>
            {s('common.copy_html') || 'Copy HTML'}
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

          <div style={{ flex: 1 }} />

          <button
            class="btn-primary"
            disabled={busy()}
            onClick={handleDownload}
          >
            <span class="icon">
              <TbOutlineDeviceFloppy />
            </span>
            {s('common.download')}
          </button>
        </div>
      </div>

      <hr class="separator-line" />

      <Show
        when={!rawText.loading}
        fallback={
          <div class="flex items-center justify-center p-32 flex-column gap-16 opacity-50">
            <progress />
            <div>{s('analysis.loading') || 'Loading...'}</div>
          </div>
        }
      >
        <div
          class="typo typo--preview mt-16"
          innerHTML={DOMPurify.sanitize(mdit.render(rawText() || ''))}
        />
      </Show>
    </div>
  );
};

export default ExportPage;

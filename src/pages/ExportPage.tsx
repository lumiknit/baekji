import type { Component } from 'solid-js';
import { createSignal, Show, onMount } from 'solid-js';
import { useNavigate, useSearchParams } from '@solidjs/router';
import { TbOutlineArrowLeft, TbOutlineFileExport } from 'solid-icons/tb';
import { activeProjectId, activeProjectLabel } from '../state/workspace_v1';
import { liveSheets } from '../state/sheet_list';
import { openSheetDoc, closeSheetDoc, waitForSync } from '../lib/doc/ydoc';
import { matchQuery } from '../lib/tag/query';
import { s } from '../lib/i18n';
import toast from 'solid-toast';

type ExportFormat = 'markdown' | 'text' | 'html';
type SheetData = { label: string; text: string };

function sheetsToMarkdown(sheets: SheetData[]): string {
  return sheets
    .filter((s) => s.text.trim())
    .map((s) => s.text.trim())
    .join('\n\n---\n\n');
}

function sheetsToText(sheets: SheetData[]): string {
  return sheets
    .filter((s) => s.text.trim())
    .map((s) =>
      s.text
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/[*_~`]/g, '')
        .trim(),
    )
    .join('\n\n');
}

function sheetsToHtml(sheets: SheetData[], title: string): string {
  const body = sheets
    .filter((s) => s.text.trim())
    .map((s) => {
      return s.text
        .trim()
        .split(/\n\n+/)
        .map((p) => {
          const hm = p.trim().match(/^(#{1,6})\s+(.*)/);
          if (hm) return `<h${hm[1].length}>${hm[2]}</h${hm[1].length}>`;
          return `<p>${p.trim().replace(/\n/g, '<br>')}</p>`;
        })
        .join('\n');
    })
    .join('\n<hr>\n');
  return `<!DOCTYPE html>\n<html lang="ko">\n<head><meta charset="utf-8"><title>${title}</title></head>\n<body>\n${body}\n</body>\n</html>`;
}

const ExportPage: Component = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = () => (searchParams.q as string | undefined) ?? '';

  const [format, setFormat] = createSignal<ExportFormat>('markdown');
  const [loading, setLoading] = createSignal(false);
  const [data, setData] = createSignal<SheetData[] | null>(null);
  const [preview, setPreview] = createSignal<string | null>(null);

  const buildPreview = (d: SheetData[], fmt: ExportFormat) => {
    let text = '';
    if (fmt === 'markdown') text = sheetsToMarkdown(d);
    else if (fmt === 'text') text = sheetsToText(d);
    else text = sheetsToHtml(d, activeProjectLabel());
    setPreview(text.slice(0, 3000) + (text.length > 3000 ? '\n…' : ''));
  };

  const load = async () => {
    setLoading(true);
    const q = query().trim();
    const sheets = q
      ? liveSheets().filter((sh) => matchQuery(q, new Set(sh.tags)))
      : liveSheets();
    const result: SheetData[] = [];
    for (const sheet of sheets) {
      const sd = openSheetDoc(sheet.id);
      await waitForSync(sd.provider);
      result.push({
        label: sheet.tags[0] ?? sheet.id.slice(0, 8),
        text: sd.content.toString(),
      });
      closeSheetDoc(sd);
    }
    setData(result);
    buildPreview(result, format());
    setLoading(false);
  };

  onMount(load);

  const handleFormatChange = (fmt: ExportFormat) => {
    setFormat(fmt);
    const d = data();
    if (d) buildPreview(d, fmt);
  };

  const handleDownload = () => {
    const d = data();
    if (!d) return;
    const fmt = format();
    let content = '',
      mime = '',
      ext = '';
    if (fmt === 'markdown') {
      content = sheetsToMarkdown(d);
      mime = 'text/markdown';
      ext = 'md';
    } else if (fmt === 'text') {
      content = sheetsToText(d);
      mime = 'text/plain';
      ext = 'txt';
    } else {
      content = sheetsToHtml(d, activeProjectLabel());
      mime = 'text/html';
      ext = 'html';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProjectLabel()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(s('project.export_download'));
  };

  return (
    <div class="page-body">
      <div class="page-header">
        <button
          class="sb-icon-btn"
          onClick={() => navigate(`/project/${activeProjectId()}`)}
        >
          <div class="btn-pad">
            <TbOutlineArrowLeft />
          </div>
        </button>
        <h1 style={{ flex: 1, margin: 0, 'font-size': '1.2rem' }}>
          {activeProjectLabel()} — {s('common.export')}
        </h1>
      </div>

      <div class="page-toolbar">
        <select
          value={format()}
          onChange={(e) =>
            handleFormatChange(e.currentTarget.value as ExportFormat)
          }
        >
          <option value="markdown">Markdown (.md)</option>
          <option value="text">{s('project.export_text')} (.txt)</option>
          <option value="html">HTML (.html)</option>
        </select>
        <button
          class="btn-primary"
          disabled={!data() || loading()}
          onClick={handleDownload}
        >
          <span class="icon">
            <TbOutlineFileExport />
          </span>
          {s('project.export_download')}
        </button>
      </div>

      <Show when={loading()}>
        <p class="hint">{s('project.export_preparing')}</p>
      </Show>

      <Show when={preview()}>
        <pre
          style={{
            background: 'var(--border)',
            padding: 'var(--sp-3)',
            'border-radius': 'var(--r)',
            'font-size': 'var(--fs-sm)',
            'white-space': 'pre-wrap',
            'word-break': 'break-word',
            'max-height': '60vh',
            overflow: 'auto',
          }}
        >
          {preview()}
        </pre>
      </Show>
    </div>
  );
};

export default ExportPage;

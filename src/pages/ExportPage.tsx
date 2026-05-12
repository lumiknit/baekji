import type { Component } from 'solid-js';
import { createSignal, Show, createEffect } from 'solid-js';
import { useParams, useNavigate, useSearchParams } from '@solidjs/router';
import {
  TbOutlineArrowLeft,
  TbOutlineFileExport,
  TbOutlineArrowUp,
  TbOutlineCopy,
  TbOutlineShare,
} from 'solid-icons/tb';
import { activeProjectLabel, openProject } from '../state/workspace_v1';
import { liveSheets } from '../state/sheet_list';
import { openSheetDoc, closeSheetDoc, waitForSync } from '../lib/doc/ydoc';
import { matchQuery } from '../lib/tag/query';
import { s } from '../lib/i18n';
import toast from 'solid-toast';

type ExportFormat = 'markdown' | 'text' | 'html';
type SheetData = { label: string; text: string };

function sheetsToMarkdown(sheets: SheetData[], joiner: string): string {
  return sheets
    .filter((s) => s.text.trim())
    .map((s) => s.text.trim())
    .join(joiner);
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
  const params = useParams();
  const [searchParams] = useSearchParams();
  const query = () => (searchParams.q as string | undefined) ?? '';
  const sheetIds = () => {
    const val = searchParams.sheetId;
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  };

  const [format, setFormat] = createSignal<ExportFormat>('markdown');
  const [joiner, setJoiner] = createSignal('\n\n---\n\n');
  const [loading, setLoading] = createSignal(false);
  const [data, setData] = createSignal<SheetData[] | null>(null);
  const [preview, setPreview] = createSignal<string | null>(null);

  const buildPreview = (d: SheetData[], fmt: ExportFormat, j: string) => {
    const text =
      fmt === 'markdown'
        ? sheetsToMarkdown(d, j)
        : fmt === 'text'
          ? sheetsToText(d)
          : sheetsToHtml(d, activeProjectLabel());
    setPreview(text);
  };

  const load = async () => {
    setLoading(true);
    await openProject(params.pjId);

    const ids = sheetIds();
    let sheets = liveSheets();
    if (ids.length > 0) {
      sheets = sheets.filter((sh) => ids.includes(sh.id));
    } else {
      const q = query().trim();
      if (q) {
        sheets = sheets.filter((sh) => matchQuery(q, new Set(sh.tags)));
      }
    }

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
    buildPreview(result, format(), joiner());
    setLoading(false);
  };

  createEffect(() => {
    if (params.pjId) load();
  });

  const handleBack = () => {
    const ids = sheetIds();
    if (ids.length === 1) {
      navigate(`/sheets/${ids[0]}`);
    } else {
      const q = query();
      navigate(
        `/project/${params.pjId}${q ? `?q=${encodeURIComponent(q)}` : ''}`,
      );
    }
  };

  const handleFormatChange = (fmt: ExportFormat) => {
    const d = data();
    if (d) buildPreview(d, fmt, joiner());
    setFormat(fmt);
  };

  const handleJoinerChange = (j: string) => {
    setJoiner(j);
    const d = data();
    if (d) buildPreview(d, format(), j);
  };

  const getExportContent = () => {
    const d = data();
    if (!d) return null;
    const fmt = format();
    if (fmt === 'markdown') return sheetsToMarkdown(d, joiner());
    if (fmt === 'text') return sheetsToText(d);
    return sheetsToHtml(d, activeProjectLabel());
  };

  const handleCopy = async () => {
    const content = getExportContent();
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      toast.success(s('common.copied'));
    } catch {
      toast.error(s('common.copy_error'));
    }
  };

  const handleShare = async () => {
    const content = getExportContent();
    if (!content) return;
    const fmt = format();
    const ext = fmt === 'markdown' ? 'md' : fmt === 'text' ? 'txt' : 'html';
    const filename = `${activeProjectLabel()}.${ext}`;

    if (navigator.share) {
      try {
        const file = new File([content], filename, {
          type:
            fmt === 'markdown'
              ? 'text/markdown'
              : fmt === 'text'
                ? 'text/plain'
                : 'text/html',
        });
        await navigator.share({
          files: [file],
          title: activeProjectLabel(),
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          toast.error(s('common.share_error'));
        }
      }
    } else {
      toast.error(s('common.share_not_supported'));
    }
  };

  const handleDownload = () => {
    const d = data();
    if (!d) return;
    const fmt = format();
    const content = getExportContent();
    if (!content) return;

    let mime: string, ext: string;
    if (fmt === 'markdown') {
      mime = 'text/markdown';
      ext = 'md';
    } else if (fmt === 'text') {
      mime = 'text/plain';
      ext = 'txt';
    } else {
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
        <button class="sb-icon-btn" onClick={handleBack}>
          <div class="btn-pad">
            <TbOutlineArrowLeft />
          </div>
        </button>
        <h1 class="page-header-title">
          {activeProjectLabel()} — {s('common.export')}
        </h1>
      </div>

      <Show when={query() && sheetIds().length === 0}>
        <div class="page-stats">
          <span>
            {s('project.filter_result', {
              query: query(),
              filtered: data()?.length ?? 0,
              total: liveSheets().length,
            })}
          </span>
        </div>
      </Show>

      <Show when={sheetIds().length > 0}>
        <div class="page-stats">
          <span>
            {s('project.selected_sheets_count', {
              count: sheetIds().length,
            })}
          </span>
        </div>
      </Show>

      <div class="page-toolbar">
        <select
          class="pj-format-select"
          value={format()}
          onChange={(e) =>
            handleFormatChange(e.currentTarget.value as ExportFormat)
          }
        >
          <option value="markdown">Markdown (.md)</option>
          <option value="text">{s('project.export_text')} (.txt)</option>
          <option value="html">HTML (.html)</option>
        </select>

        <Show when={format() === 'markdown'}>
          <select
            class="pj-format-select"
            value={joiner()}
            onChange={(e) => handleJoinerChange(e.currentTarget.value)}
          >
            <option value={'\n\n'}>Double Newline (\n\n)</option>
            <option value={'\n\n---\n\n'}>Horizontal Rule (\n\n---\n\n)</option>
            <option value={'\n\n***\n\n'}>Asterisk Rule (\n\n***\n\n)</option>
          </select>
        </Show>

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

        <button
          class="btn-border"
          disabled={!data() || loading()}
          onClick={handleCopy}
          title={s('common.copy')}
        >
          <span class="icon">
            <TbOutlineCopy />
          </span>
          {s('common.copy')}
        </button>

        <Show when={navigator.share}>
          <button
            class="btn-border"
            disabled={!data() || loading()}
            onClick={handleShare}
            title={s('common.share')}
          >
            <span class="icon">
              <TbOutlineShare />
            </span>
            {s('common.share')}
          </button>
        </Show>
      </div>

      <Show when={loading()}>
        <p class="hint">{s('project.export_preparing')}</p>
      </Show>

      <Show when={preview()}>
        <div class="export-preview-container">
          <pre class="export-preview typo">{preview()}</pre>
          <button
            class="scroll-to-top-btn sb-icon-btn"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <div class="btn-pad">
              <TbOutlineArrowUp />
            </div>
          </button>
        </div>
      </Show>
    </div>
  );
};

export default ExportPage;

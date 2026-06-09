import type { Component } from 'solid-js';
import { createSignal, createEffect, For, Show } from 'solid-js';
import {
  TbOutlineFileExport,
  TbOutlineArrowUp,
  TbOutlineCopy,
  TbOutlineShare,
} from 'solid-icons/tb';
import { activeProjectLabel } from '../../state/workspace_v3.ts';
import { s } from '../../lib/i18n/index.ts';
import toast from 'solid-toast';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import type { QueriedSheet } from './types.ts';

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
const mdExport = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

type ExportFormat = 'markdown' | 'text' | 'html' | 'docx';

const SEP_OPTIONS: { label: string; value: string }[] = [
  { label: 'Newlines', value: '\n\n' },
  { label: '---', value: '\n\n---\n\n' },
  { label: '***', value: '\n\n***\n\n' },
  { label: '----------', value: '\n\n----------\n\n' },
  { label: '**********', value: '\n\n**********\n\n' },
];

type HeaderMode = 'none' | 'html' | 'yaml';

function buildMarkdown(
  sheets: { tags: string[]; text: string }[],
  joiner: string,
  headerMode: HeaderMode,
): string {
  const parts = sheets
    .filter((s) => s.text.trim())
    .map((s, i) => {
      const content = s.text.trim();
      if (headerMode === 'html') {
        const header = `<!---\n${JSON.stringify({ index: i, tags: s.tags })}\n-->`;
        return `${header}\n${content}`;
      }
      if (headerMode === 'yaml') {
        const header = `---\nindex: ${i}\ntags: ${JSON.stringify(s.tags)}\n---`;
        return `${header}\n${content}`;
      }
      return content;
    });
  return parts.join(joiner);
}

function markdownToText(markdown: string): string {
  const html = mdExport.render(markdown);
  const div = document.createElement('div');
  div.innerHTML = html;
  const blocks = div.querySelectorAll(
    'p, h1, h2, h3, h4, h5, h6, li, hr, blockquote, pre',
  );
  for (const el of blocks) el.prepend('\n');
  return div.textContent?.trim() ?? '';
}

function markdownToHtml(markdown: string, title: string): string {
  const body = DOMPurify.sanitize(mdExport.render(markdown));
  return `<!DOCTYPE html>\n<html lang="ko">\n<head><meta charset="utf-8"><title>${title}</title></head>\n<body>\n${body}\n</body>\n</html>`;
}

interface Props {
  sheets: QueriedSheet[];
}

const PreviewTab: Component<Props> = (props) => {
  const [format, setFormat] = createSignal<ExportFormat>('markdown');
  const [joiner, setJoiner] = createSignal('\n\n---\n\n');
  const [headerMode, setHeaderMode] = createSignal<HeaderMode>('none');
  const [loading, setLoading] = createSignal(false);
  const [data, setData] = createSignal<
    { tags: string[]; text: string }[] | null
  >(null);
  const [preview, setPreview] = createSignal<string | null>(null);
  const [previewHtml, setPreviewHtml] = createSignal<string | null>(null);

  const buildPreview = (
    d: { tags: string[]; text: string }[],
    fmt: ExportFormat,
    j: string,
    hm: HeaderMode,
  ) => {
    const mdText = buildMarkdown(d, j, hm);
    if (fmt === 'markdown') {
      setPreview(mdText);
      setPreviewHtml(DOMPurify.sanitize(md.render(mdText)));
    } else if (fmt === 'text') {
      setPreview(markdownToText(mdText));
      setPreviewHtml(null);
    } else {
      setPreview(markdownToHtml(mdText, activeProjectLabel()));
      setPreviewHtml(null);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const result = await Promise.all(
        props.sheets.map(async (qs) => ({
          label: qs.meta.tags[0] ?? qs.meta.id.slice(0, 8),
          tags: qs.meta.tags,
          text: await qs.getContent(),
        })),
      );
      setData(result);
      buildPreview(result, format(), joiner(), headerMode());
    } catch {
      toast.error(s('common.export_error'));
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    void props.sheets; // track: re-load whenever sheet list changes
    load();
  });

  const getExportContent = () => {
    const d = data();
    if (!d) return null;
    const mdText = buildMarkdown(d, joiner(), headerMode());
    const fmt = format();
    if (fmt === 'markdown') return mdText;
    if (fmt === 'text') return markdownToText(mdText);
    return markdownToHtml(mdText, activeProjectLabel());
  };

  const handleFormatChange = (fmt: ExportFormat) => {
    const d = data();
    if (d) buildPreview(d, fmt, joiner(), headerMode());
    setFormat(fmt);
  };

  const handleJoinerChange = (j: string) => {
    setJoiner(j);
    const d = data();
    if (d) buildPreview(d, format(), j, headerMode());
  };

  const handleHeaderModeChange = (hm: HeaderMode) => {
    setHeaderMode(hm);
    const d = data();
    if (d) buildPreview(d, format(), joiner(), hm);
  };

  const handleCopy = async () => {
    const content = getExportContent();
    if (!content) return;
    try {
      const html = previewHtml();
      if (html && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([content], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(content);
      }
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
        await navigator.share({ files: [file], title: activeProjectLabel() });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          toast.error(s('common.share_error'));
        }
      }
    } else {
      toast.error(s('common.share_not_supported'));
    }
  };

  const handleDownload = async () => {
    const d = data();
    if (!d) return;
    const fmt = format();

    if (fmt === 'docx') {
      try {
        const mdText = buildMarkdown(d, joiner(), headerMode());
        const bodyHtml = mdExport.render(mdText);
        const { convert } = await import('../../lib/html_to_docx.ts');
        const blob = await convert(bodyHtml);
        const url = URL.createObjectURL(blob as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeProjectLabel()}.docx`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(s('project.export_download'));
      } catch {
        toast.error(s('common.export_error'));
      }
      return;
    }

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
    <div>
      <div class="page-toolbar flex flex-wrap gap-2">
        <select
          value={format()}
          onChange={(e) =>
            handleFormatChange(e.currentTarget.value as ExportFormat)
          }
        >
          <option value="markdown">Markdown (.md)</option>
          <option value="text">{s('project.export_text')} (.txt)</option>
          <option value="html">HTML (.html)</option>
          <option value="docx">Word (.docx)</option>
        </select>

        <select
          value={joiner()}
          onChange={(e) => handleJoinerChange(e.currentTarget.value)}
        >
          <For each={SEP_OPTIONS}>
            {(opt) => <option value={opt.value}>{opt.label}</option>}
          </For>
        </select>

        <select
          value={headerMode()}
          onChange={(e) =>
            handleHeaderModeChange(e.currentTarget.value as HeaderMode)
          }
        >
          <option value="none">{s('project.export_header_none')}</option>
          <option value="html">{s('project.export_header_html')}</option>
          <option value="yaml">{s('project.export_header_yaml')}</option>
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
        <button
          class="btn-border"
          disabled={!data() || loading() || format() === 'docx'}
          onClick={handleCopy}
        >
          <span class="icon">
            <TbOutlineCopy />
          </span>
          {s('common.copy')}
        </button>
        <button
          class="btn-border"
          disabled={
            !data() || loading() || !navigator.share || format() === 'docx'
          }
          onClick={handleShare}
        >
          <span class="icon">
            <TbOutlineShare />
          </span>
          {s('common.share')}
        </button>
      </div>

      <Show when={loading()}>
        <p class="hint">{s('project.export_preparing')}</p>
      </Show>

      <Show when={preview()}>
        <div class="export-preview-container">
          <Show
            when={previewHtml()}
            fallback={
              <pre class="export-preview export-preview--plain typo">
                {preview()}
              </pre>
            }
          >
            {(html) => <div class="export-preview typo" innerHTML={html()} />}
          </Show>
          <button
            class="scroll-to-top-btn sb-icon-btn"
            onClick={() => globalThis.scrollTo({ top: 0, behavior: 'smooth' })}
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

export default PreviewTab;

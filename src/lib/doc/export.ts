import MarkdownIt from 'markdown-it';
import { collectText } from './db_helper';

const mdit = new MarkdownIt({ html: false, linkify: true, typographer: true });

// ─── 파일명 유틸 ──────────────────────────────────────────────

export function sanitizeFilename(name: string): string {
  return name.slice(0, 128).replace(/[{}\x00-\x20\\/:*?"<>|_]+/g, '_');
}

export function timestampSuffix(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(2);
  return (
    `${y}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}` +
    '_' +
    `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  );
}

// ─── 다운로드 / 공유 ──────────────────────────────────────────

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function shareBlob(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
  } else {
    downloadBlob(blob, filename);
  }
}

export type ExportFormat = 'md' | 'txt' | 'html';

export function stripMarkdown(text: string): string {
  const html = mdit.render(text);
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

export async function buildExportBlob(
  nodeId: string,
  format: ExportFormat,
  includeHidden: boolean,
): Promise<{ blob: Blob; ext: string }> {
  const text = await collectText(nodeId, includeHidden);

  switch (format) {
    case 'txt':
      return {
        blob: new Blob([stripMarkdown(text)], { type: 'text/plain' }),
        ext: 'txt',
      };
    case 'html': {
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${mdit.render(text)}</body></html>`;
      return { blob: new Blob([html], { type: 'text/html' }), ext: 'html' };
    }
    default:
      return { blob: new Blob([text], { type: 'text/plain' }), ext: 'md' };
  }
}

export async function printExport(
  nodeId: string,
  includeHidden: boolean,
): Promise<void> {
  const text = await collectText(nodeId, includeHidden);
  const body = mdit.render(text);

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.documentElement.innerHTML = `
    <html>
      <head>
        <style>
          @page { margin: 20mm; }
          body { font-family: serif; line-height: 1.6; }
          .page-break { page-break-before: always; }
        </style>
      </head>
      <body>${body}</body>
    </html>
  `;

  iframe.contentWindow!.print();
  document.body.removeChild(iframe);
}

import type { Component } from 'solid-js';
import { createResource, createSignal, For, Show } from 'solid-js';
import { useParams } from '@solidjs/router';
import {
  getAllVersionRoots,
  getAllNodesInVersion,
  getSheetContent,
  deleteVersionSubtree,
} from '../lib/doc/db';
import { showConfirm } from '../state/modal';

const V0ProjectPage: Component = () => {
  const params = useParams<{ pjId: string }>();
  const [deleting, setDeleting] = createSignal(false);

  const [data, { refetch }] = createResource(
    () => params.pjId,
    async (pjId) => {
      const all = await getAllVersionRoots();
      const versions = all.filter((r) => r.projectId === pjId || r.id === pjId);

      const versionsWithSheets = await Promise.all(
        versions.map(async (v) => {
          const nodes = await getAllNodesInVersion(v.id);
          const sheets = await Promise.all(
            nodes
              .filter((n) => n.type === 'sheet')
              .sort((a, b) => (a.orderKey ?? 0) - (b.orderKey ?? 0))
              .map(async (n) => {
                const sc = await getSheetContent(n.id);
                return { node: n, markdown: sc?.markdown ?? '' };
              }),
          );
          return { version: v, sheets };
        }),
      );

      return versionsWithSheets;
    },
  );

  const downloadAll = (
    versionLabel: string,
    sheets: { node: { label?: string; id: string }; markdown: string }[],
  ) => {
    const lines: string[] = [];
    for (const s of sheets) {
      lines.push(`# ${s.node.label ?? s.node.id}`);
      lines.push('');
      lines.push(s.markdown);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${versionLabel}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteVersion = async (versionId: string, label: string) => {
    const ok = await showConfirm(
      '버전 삭제',
      `"${label}" 버전을 영구 삭제할까요? 복구할 수 없습니다.`,
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteVersionSubtree(versionId);
      refetch();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div class="page-body">
      <h1 class="page-header-title">레거시 프로젝트 (V0)</h1>
      <p class="hint">
        구형 포맷(V0) 프로젝트입니다. 내용을 확인하고 필요한 내용을 복사하거나
        다운로드한 뒤 삭제하세요.
      </p>

      <Show when={data.loading}>
        <div class="empty-state">불러오는 중…</div>
      </Show>

      <Show when={!data.loading && (data() ?? []).length === 0}>
        <div class="empty-state">해당 프로젝트를 찾을 수 없습니다.</div>
      </Show>

      <For each={data() ?? []}>
        {(item) => (
          <div class="v0-card">
            <div class="v0-card-header">
              <span
                class="v0-card-label"
                style={{ flex: 1, 'font-weight': 600 }}
              >
                {item.version.label}
              </span>
              <span
                class="v0-card-meta"
                style={{ opacity: 0.5, 'font-size': '0.8rem' }}
              >
                {item.version.updatedAt?.slice(0, 10)}
              </span>
              <button
                class="btn-border btn-sm"
                onClick={() => downloadAll(item.version.label, item.sheets)}
              >
                다운로드 (.md)
              </button>
              <button
                class="btn-border btn-sm"
                style={{ color: 'var(--accent)' }}
                disabled={deleting()}
                onClick={() =>
                  deleteVersion(item.version.id, item.version.label)
                }
              >
                삭제
              </button>
            </div>

            <div class="v0-card-body">
              <Show when={item.sheets.length === 0}>
                <div class="empty-state">시트 없음</div>
              </Show>
              <For each={item.sheets}>
                {(sheet) => (
                  <div class="v0-sheet-item">
                    <div class="v0-sheet-label">
                      {(sheet.node as any).label ?? sheet.node.id}
                    </div>
                    <pre class="v0-sheet-content">
                      {sheet.markdown || '(내용 없음)'}
                    </pre>
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </For>
    </div>
  );
};

export default V0ProjectPage;

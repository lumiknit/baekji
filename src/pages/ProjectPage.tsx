import type { Component } from 'solid-js';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { TbOutlinePencil, TbFillTrash, TbOutlineReportAnalytics, TbOutlineFileExport } from 'solid-icons/tb';
import { activeProjectDoc, activeProjectId, activeProjectLabel, closeProject } from '../state/workspace_v1';
import { liveSheets, filteredSheets, filterQuery } from '../state/sheet_list';
import { putProject, deleteProject } from '../lib/doc/db_v1';
import { openSheetDoc, closeSheetDoc, waitForSync } from '../lib/doc/ydoc';
import { tagToHsl } from '../lib/tag/color';
import { showConfirm, showPrompt } from '../state/modal';
import { setSidebarView } from '../state/workspace';
import toast from 'solid-toast';
import { formatCompact } from '../lib/number';

const ProjectPage: Component = () => {
  const navigate = useNavigate();
  const [analyzing, setAnalyzing] = createSignal(false);
  const [stats, setStats] = createSignal<{ sheets: number; chars: number; charsNoSpace: number } | null>(null);

  const pd = () => activeProjectDoc();
  const projectLabel = activeProjectLabel;

  const allTags = createMemo(() => {
    const counts = new Map<string, number>();
    for (const sheet of liveSheets()) {
      for (const tag of sheet.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  });

  const tagColors = () => {
    const p = pd();
    if (!p) return {} as Record<string, { h: number; s: number }>;
    return (p.meta.get('tagColors') as Record<string, { h: number; s: number }> | undefined) ?? {};
  };

  const renameProject = async () => {
    const label = await showPrompt('프로젝트 이름 변경', '새 이름을 입력하세요', projectLabel());
    if (!label || label === projectLabel()) return;
    const p = pd();
    if (!p) return;
    const now = new Date().toISOString();
    p.meta.set('label', label);
    p.meta.set('updatedAt', now);
    const id = activeProjectId();
    if (id) putProject({ id, label, updatedAt: now, tagColors: tagColors() });
  };

  const handleDeleteProject = async () => {
    const confirmed = await showConfirm(
      '프로젝트 삭제',
      `"${projectLabel()}" 프로젝트를 삭제하시겠습니까? 모든 시트가 영구적으로 삭제됩니다.`,
    );
    if (!confirmed) return;
    const id = activeProjectId();
    if (id) await deleteProject(id);
    await closeProject();
    setSidebarView('projects');
    navigate('/');
  };

  const setTagColorOverride = (tag: string, h: number, s: number) => {
    const p = pd();
    if (!p) return;
    const colors = { ...tagColors(), [tag]: { h, s } };
    p.meta.set('tagColors', colors);
    const id = activeProjectId();
    if (id) putProject({ id, label: projectLabel(), updatedAt: new Date().toISOString(), tagColors: colors });
  };

  const clearTagColorOverride = (tag: string) => {
    const p = pd();
    if (!p) return;
    const colors = { ...tagColors() };
    delete colors[tag];
    p.meta.set('tagColors', colors);
    const id = activeProjectId();
    if (id) putProject({ id, label: projectLabel(), updatedAt: new Date().toISOString(), tagColors: colors });
  };

  // ─── 분석 ───────────────────────────────────────────────────────

  const analyzeSheets = async () => {
    setAnalyzing(true);
    setStats(null);
    const sheets = filteredSheets();
    let totalChars = 0;
    let totalCharsNoSpace = 0;
    for (const sheet of sheets) {
      const sd = openSheetDoc(sheet.id);
      await waitForSync(sd.provider);
      const text = sd.content.toString();
      closeSheetDoc(sd);
      totalChars += text.length;
      totalCharsNoSpace += text.replace(/\s/g, '').length;
    }
    setStats({ sheets: sheets.length, chars: totalChars, charsNoSpace: totalCharsNoSpace });
    setAnalyzing(false);
  };

  const exportSheets = async () => {
    const sheets = filteredSheets();
    const parts: string[] = [];
    for (const sheet of sheets) {
      const sd = openSheetDoc(sheet.id);
      await waitForSync(sd.provider);
      const text = sd.content.toString().trim();
      closeSheetDoc(sd);
      if (text) parts.push(text);
    }
    const blob = new Blob([parts.join('\n\n---\n\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const label = filterQuery() ? `${projectLabel()}_필터` : projectLabel();
    a.download = `${label}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${sheets.length}개 시트 내보내기 완료`);
  };

  return (
    <Show when={pd()} fallback={<div class="empty-state">프로젝트가 열려 있지 않습니다</div>}>
      <div style={{ padding: '0 1.5rem 3rem', 'max-width': '600px', margin: '0 auto' }}>

        {/* 프로젝트 이름 */}
        <div class="page-header" style={{ 'padding-top': '2rem' }}>
          <h1 style={{ flex: 1, margin: 0, 'font-size': '1.4rem' }}>{projectLabel()}</h1>
          <button class="btn-border" onClick={renameProject}>
            <span class="icon"><TbOutlinePencil /></span>
            이름 변경
          </button>
        </div>

        <div class="page-stats">
          <span>시트 {liveSheets().length}개</span>
          <span>태그 {allTags().length}종</span>
        </div>

        {/* ─── 필터 분석 ─── */}
        <h2 style={{ 'font-size': '1rem', 'margin-bottom': '0.5rem', opacity: 0.6 }}>
          분석 / 내보내기
          <Show when={filterQuery()}>
            <span style={{ 'font-size': '0.75rem', 'margin-left': '8px', opacity: 0.6 }}>
              (필터: {filterQuery()}, {filteredSheets().length}개)
            </span>
          </Show>
          <Show when={!filterQuery()}>
            <span style={{ 'font-size': '0.75rem', 'margin-left': '8px', opacity: 0.6 }}>
              (전체 {liveSheets().length}개)
            </span>
          </Show>
        </h2>

        <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '1rem' }}>
          <button class="btn-border" onClick={analyzeSheets} disabled={analyzing()}>
            <span class="icon"><TbOutlineReportAnalytics /></span>
            {analyzing() ? '분석 중…' : '글자수 분석'}
          </button>
          <button class="btn-border" onClick={exportSheets}>
            <span class="icon"><TbOutlineFileExport /></span>
            마크다운으로 내보내기
          </button>
        </div>

        <Show when={stats()}>
          {(s) => (
            <div class="version-meta" style={{ 'margin-top': 0, 'margin-bottom': '1.5rem' }}>
              <div class="version-meta-row">
                <span class="version-meta-key">시트 수</span>
                <span>{s().sheets}개</span>
              </div>
              <div class="version-meta-row">
                <span class="version-meta-key">전체 글자수</span>
                <span>{formatCompact(s().chars)} ({s().chars.toLocaleString()}자)</span>
              </div>
              <div class="version-meta-row">
                <span class="version-meta-key">공백 제외</span>
                <span>{formatCompact(s().charsNoSpace)} ({s().charsNoSpace.toLocaleString()}자)</span>
              </div>
            </div>
          )}
        </Show>

        {/* ─── 태그 목록 ─── */}
        <Show when={allTags().length > 0}>
          <h2 style={{ 'font-size': '1rem', 'margin-bottom': '0.5rem', opacity: 0.6 }}>태그 색상</h2>
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px', 'margin-bottom': '2rem' }}>
            <For each={allTags()}>
              {([tag, count]) => {
                const override = () => tagColors()[tag];
                const { h: ah, s: as_ } = tagToHsl(tag);
                const eff = () => override() ?? { h: ah, s: as_ };

                return (
                  <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', padding: '4px 0' }}>
                    <span
                      class="sl-tag"
                      style={{ background: `hsl(${eff().h}deg ${eff().s}% 60% / 0.25)`, color: `hsl(${eff().h}deg ${eff().s}% 35%)`, 'min-width': '80px' }}
                    >
                      {tag}
                    </span>
                    <span style={{ 'font-size': '12px', opacity: 0.4 }}>{count}개</span>
                    <div style={{ 'margin-left': 'auto', display: 'flex', 'align-items': 'center', gap: '6px' }}>
                      <input
                        type="color"
                        class="tree-color-input"
                        title="색상 지정"
                        onInput={(e) => {
                          const hex = e.currentTarget.value;
                          const r = parseInt(hex.slice(1, 3), 16) / 255;
                          const g = parseInt(hex.slice(3, 5), 16) / 255;
                          const b = parseInt(hex.slice(5, 7), 16) / 255;
                          const max = Math.max(r, g, b), min = Math.min(r, g, b);
                          const d = max - min;
                          let h = 0;
                          if (d !== 0) {
                            if (max === r) h = ((g - b) / d + 6) % 6;
                            else if (max === g) h = (b - r) / d + 2;
                            else h = (r - g) / d + 4;
                            h = Math.round(h * 60);
                          }
                          const s = max === 0 ? 0 : Math.round((d / max) * 100);
                          setTagColorOverride(tag, h, s);
                        }}
                      />
                      <Show when={override()}>
                        <button class="tree-color-clear" title="자동 색상으로 되돌리기" onClick={() => clearTagColorOverride(tag)}>✕</button>
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>

        {/* ─── 위험 구역 ─── */}
        <div class="danger-zone">
          <p class="danger-zone-title">위험 구역</p>
          <p class="danger-zone-desc">프로젝트를 삭제하면 모든 시트가 영구적으로 사라집니다.</p>
          <button class="btn-danger" onClick={handleDeleteProject}>
            <span class="icon"><TbFillTrash /></span>
            프로젝트 삭제
          </button>
        </div>
      </div>
    </Show>
  );
};

export default ProjectPage;

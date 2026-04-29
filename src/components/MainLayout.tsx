import type { Component } from 'solid-js';
import { createEffect, createMemo, Match, Show, Switch, onMount, onCleanup } from 'solid-js';
import {
  isSidebarOpen,
  setSidebarOpen,
  sidebarWidth,
  setSidebarWidth,
  sidebarView,
  setSidebarView,
} from '../state/workspace';
import { createMediaQuery } from '@solid-primitives/media';
import { A, useLocation, type RouteSectionProps } from '@solidjs/router';
import TreeView from './treeview/TreeView';
import ProjectList from './ProjectList';
import ModalContainer from './modal/ModalContainer';
import { s } from '../lib/i18n';
import {
  TbFillLayoutSidebarLeftCollapse,
  TbFillSettings,
  TbOutlineLayoutSidebarLeftExpand,
  TbOutlineCarouselVertical,
} from 'solid-icons/tb';

const MainLayout: Component<RouteSectionProps> = (props) => {
  const isMobile = createMediaQuery('(max-width: 768px)');
  const isNarrow = createMemo(() => isMobile() || sidebarWidth() < 300);
  const location = useLocation();

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        setSidebarOpen(!isSidebarOpen());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown));
  });

  createEffect(() => {
    location.pathname; // track
    if (isMobile()) setSidebarOpen(false);
  });

  const handleResizerPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = sidebarWidth();
    const onMove = (me: PointerEvent) => {
      const newWidth = startWidth + (me.clientX - startX);
      if (newWidth > 150 && newWidth < 600) setSidebarWidth(newWidth);
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  return (
    <div
      class={`main-layout ${isSidebarOpen() ? 'sidebar-open' : 'sidebar-closed'}`}
    >
      <div
        class={`sidebar${isNarrow() ? ' narrow' : ''}`}
        style={{
          width: isMobile() ? '100%' : `${sidebarWidth()}px`,
          display: isSidebarOpen() ? 'flex' : 'none',
        }}
      >
        <div class="sidebar-nav">
          <A href="/settings" class="sb-nav-btn" title={s('common.settings')}>
            <div class="btn-pad">
              <span class="icon"><TbFillSettings /></span>
              <Show when={!isNarrow()}>{s('common.settings')}</Show>
            </div>
          </A>
          <button
            class={`sb-nav-btn${sidebarView() === 'projects' ? ' sb-nav-btn--active' : ''}`}
            onClick={() =>
              setSidebarView(sidebarView() === 'tree' ? 'projects' : 'tree')
            }
            title={s('sidebar.project_list')}
          >
            <div class="btn-pad">
              <span class="icon"><TbOutlineCarouselVertical /></span>
              <Show when={!isNarrow()}>{s('sidebar.project_list')}</Show>
            </div>
          </button>
        </div>
        <div class="sidebar-content">
          <Switch>
            <Match when={sidebarView() === 'tree'}>
              <TreeView />
            </Match>
            <Match when={sidebarView() === 'projects'}>
              <ProjectList />
            </Match>
          </Switch>
        </div>
      </div>

      {!isMobile() && isSidebarOpen() && (
        <div class="resizer" onPointerDown={handleResizerPointerDown} />
      )}

      <div class="content">{props.children}</div>

      <button
        class={`sidebar-toggle ${isSidebarOpen() ? 'active' : ''}`}
        onClick={() => setSidebarOpen(!isSidebarOpen())}
      >
        <div class="btn-pad">
          <Switch>
            <Match when={isSidebarOpen()}>
              <span class="icon"><TbFillLayoutSidebarLeftCollapse /></span>
            </Match>
            <Match when={!isSidebarOpen()}>
              <span class="icon"><TbOutlineLayoutSidebarLeftExpand /></span>
            </Match>
          </Switch>
        </div>
      </button>

      <ModalContainer />
    </div>
  );
};

export default MainLayout;

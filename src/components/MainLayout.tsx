import type { Component } from 'solid-js';
import { createEffect, Match, Switch, onMount, onCleanup } from 'solid-js';
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
import TreeView from './TreeView';
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
        class="sidebar"
        style={{
          width: isMobile() ? '100%' : `${sidebarWidth()}px`,
          display: isSidebarOpen() ? 'flex' : 'none',
        }}
      >
        <div class="sidebar-nav">
          <A href="/settings" class="btn-skeleton sidebar-nav-btn">
            <TbFillSettings /> {s('common.settings')}
          </A>
          <button
            class={`btn-skeleton sidebar-nav-btn ${sidebarView() === 'projects' ? 'sidebar-view-toggle--active' : ''}`}
            onClick={() =>
              setSidebarView(sidebarView() === 'tree' ? 'projects' : 'tree')
            }
            title={s('sidebar.project_list')}
          >
            <TbOutlineCarouselVertical /> {s('sidebar.project_list')}
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
        <Switch>
          <Match when={isSidebarOpen()}>
            <TbFillLayoutSidebarLeftCollapse />
          </Match>
          <Match when={!isSidebarOpen()}>
            <TbOutlineLayoutSidebarLeftExpand />
          </Match>
        </Switch>
      </button>

      <ModalContainer />
    </div>
  );
};

export default MainLayout;

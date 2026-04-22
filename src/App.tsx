import { HashRouter, Route } from '@solidjs/router';
import type { Component } from 'solid-js';
import { createEffect, onMount } from 'solid-js';
import MainLayout from './components/MainLayout';
import AboutPage from './pages/AboutPage';
import AnalysisPage from './pages/AnalysisPage';
import BootstrapPage from './pages/BootstrapPage';
import NodePage from './pages/NodePage';
import PreviewPage from './pages/PreviewPage';
import SearchPage from './pages/SearchPage';
import SettingsPage from './pages/SettingsPage';
import PausedPage from './pages/PausedPage';
import { updateRootStyle } from './state/settings';
import { activePjVerId } from './state/workspace';
import { projectTree } from './state/project_tree';
import { initTabSync, notifyProjectOpen } from './lib/sync';

const App: Component = () => {
  onMount(() => {
    initTabSync();
  });

  createEffect(updateRootStyle);

  createEffect(() => {
    const id = activePjVerId();
    const meta = projectTree.meta;
    // Only notify when both ID and metadata are loaded and match
    if (id && meta && meta.pjVerId === id) {
      notifyProjectOpen(id, meta.label);
    }
  });

  return (
    <HashRouter root={MainLayout}>
      <Route path="/" component={BootstrapPage} />
      <Route path="/nodes/:id" component={NodePage} />
      <Route path="/nodes/:id/preview" component={PreviewPage} />
      <Route path="/nodes/:id/analysis" component={AnalysisPage} />
      <Route path="/search" component={SearchPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/paused" component={PausedPage} />
    </HashRouter>
  );
};

export default App;

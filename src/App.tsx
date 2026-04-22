import { HashRouter, Route } from '@solidjs/router';
import type { Component } from 'solid-js';
import { createEffect } from 'solid-js';
import MainLayout from './components/MainLayout';
import AboutPage from './pages/AboutPage';
import AnalysisPage from './pages/AnalysisPage';
import BootstrapPage from './pages/BootstrapPage';
import NodePage from './pages/NodePage';
import PreviewPage from './pages/PreviewPage';
import SearchPage from './pages/SearchPage';
import SettingsPage from './pages/SettingsPage';
import { updateRootStyle } from './state/settings';

const App: Component = () => {
  createEffect(updateRootStyle);

  return (
    <HashRouter root={MainLayout}>
      <Route path="/" component={BootstrapPage} />
      <Route path="/nodes/:id" component={NodePage} />
      <Route path="/nodes/:id/preview" component={PreviewPage} />
      <Route path="/nodes/:id/analysis" component={AnalysisPage} />
      <Route path="/search" component={SearchPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/about" component={AboutPage} />
    </HashRouter>
  );
};

export default App;

import { HashRouter, Route } from '@solidjs/router';
import type { Component } from 'solid-js';
import { Toaster } from 'solid-toast';
import toast from 'solid-toast';
import { createEffect, onMount } from 'solid-js';
import MainLayout from './components/MainLayout';
import AboutPage from './pages/AboutPage';
import BootstrapPage from './pages/BootstrapPage';
import SheetPage from './pages/SheetPage';
import ProjectPage from './pages/ProjectPage';
import AnalysisPage from './pages/AnalysisPage';
import ExportPage from './pages/ExportPage';
import SettingsPage from './pages/SettingsPage';
import SearchPage from './pages/SearchPage';
import LoadingBackupPage from './pages/LoadingBackupPage';
import ComparePage from './pages/ComparePage';
import LogsPage from './pages/LogsPage';
import RemotePage from './pages/RemotePage';
import { updateRootStyle } from './state/settings';
import { handleRedirect } from './lib/sync/auth_redirect';
import { PENDING_PROVIDER_KEY } from './lib/sync/interface';
import { s } from './lib/i18n';
import { logError, logInfo } from './state/log';

const App: Component = () => {
  onMount(() => {
    logInfo('App initialized');

    (async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      if (code) {
        const pendingProvider =
          localStorage.getItem(PENDING_PROVIDER_KEY) ?? 'dropbox';
        try {
          await handleRedirect(code);
        } catch (err) {
          logError('App:OAuthCallback', err);
          setTimeout(() => {
            const error = err as { message?: string };
            const key = error?.message ?? '';
            const fallback =
              pendingProvider === 'gdrive'
                ? s('gdrive.error_auth_callback')
                : s('dropbox.error_auth_callback');
            const msg =
              key.startsWith('dropbox.') || key.startsWith('gdrive.')
                ? s(key)
                : fallback;
            toast.error(msg, { duration: 6000 });
          }, 500);
        }
        history.replaceState(null, '', location.pathname + '#/remote');
      }

      if (!(await navigator.storage.persisted())) {
        await navigator.storage.persist();
      }
    })();
  });

  createEffect(updateRootStyle);

  return (
    <>
      <Toaster position="top-center" />
      <HashRouter root={MainLayout}>
        <Route path="/" component={BootstrapPage} />
        <Route path="/sheets/:id" component={SheetPage} />
        <Route path="/project/:pjId" component={ProjectPage} />
        <Route path="/project/:pjId/analysis" component={AnalysisPage} />
        <Route path="/project/:pjId/export" component={ExportPage} />
        <Route path="/search" component={SearchPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/about" component={AboutPage} />
        <Route path="/loading-backup" component={LoadingBackupPage} />
        <Route path="/compare/:idA/:idB" component={ComparePage} />
        <Route path="/logs" component={LogsPage} />
        <Route path="/remote" component={RemotePage} />
      </HashRouter>
    </>
  );
};

export default App;

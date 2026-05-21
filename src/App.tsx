import { HashRouter, Route } from '@solidjs/router';
import type { Component } from 'solid-js';
import { Toaster } from 'solid-toast';
import toast from 'solid-toast';
import { createEffect, onMount } from 'solid-js';
import MainLayout from './components/MainLayout.tsx';
import AboutPage from './pages/AboutPage.tsx';
import BootstrapPage from './pages/BootstrapPage.tsx';
import SheetPage from './pages/SheetPage.tsx';
import ProjectPage from './pages/ProjectPage.tsx';
import AnalysisPage from './pages/AnalysisPage.tsx';
import ExportPage from './pages/ExportPage.tsx';
import SettingsPage from './pages/SettingsPage.tsx';
import SearchPage from './pages/SearchPage.tsx';
import LoadingBackupPage from './pages/LoadingBackupPage.tsx';
import ComparePage from './pages/ComparePage.tsx';
import LogsPage from './pages/LogsPage.tsx';
import RemotePage from './pages/RemotePage.tsx';
import { updateRootStyle } from './state/settings.ts';
import { handleRedirect } from './lib/sync/auth_redirect.ts';
import { PENDING_PROVIDER_KEY, isI18nError } from './lib/sync/interface.ts';
import { s } from './lib/i18n/index.ts';
import { logError, logInfo } from './state/log.ts';

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
            const msg = isI18nError(err)
              ? s(err.i18nKey)
              : pendingProvider === 'gdrive'
                ? s('gdrive.error_auth_callback')
                : s('dropbox.error_auth_callback');
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

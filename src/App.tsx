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
import V0ProjectPage from './pages/V0ProjectPage';
import SettingsPage from './pages/SettingsPage';
import { updateRootStyle } from './state/settings';
import { handleCallback } from './lib/sync/dropbox_auth';
import { s } from './lib/i18n';
import { logError, logInfo } from './state/log';
import { initTabSync } from './lib/sync';

const App: Component = () => {
  onMount(() => {
    logInfo('App initialized');
    initTabSync();

    (async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      if (code) {
        try {
          await handleCallback(code);
        } catch (err: any) {
          logError('App:DropboxCallback', err);
          setTimeout(() => {
            const key = err?.message ?? '';
            const msg = key.startsWith('dropbox.')
              ? s(key)
              : s('dropbox.error_auth_callback');
            toast.error(msg, { duration: 6000 });
          }, 500);
        }
        history.replaceState(null, '', location.pathname + '#/settings');
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
        <Route path="/v0-project/:pjId" component={V0ProjectPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/about" component={AboutPage} />
      </HashRouter>
    </>
  );
};

export default App;

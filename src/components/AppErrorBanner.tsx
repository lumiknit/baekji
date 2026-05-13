import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { appErrors, dismissAppError } from '../state/errors';
import { openBackupModal } from '../state/modal';
import { s } from '../lib/i18n';

const AppErrorBanner: Component = () => {
  const hasQuotaError = () =>
    appErrors().some((e) => e.kind === 'quota_exceeded');

  return (
    <Show when={hasQuotaError()}>
      <div class="app-error-banner">
        <span class="app-error-banner-msg">
          {s('errors.quota_exceeded_msg')}
        </span>
        <div class="app-error-banner-actions">
          <button
            class="btn-sm btn-primary"
            onClick={() => {
              dismissAppError('quota_exceeded');
              openBackupModal();
            }}
          >
            {s('errors.backup_now')}
          </button>
          <button
            class="btn-sm btn-ghost"
            onClick={() => dismissAppError('quota_exceeded')}
          >
            {s('errors.dismiss')}
          </button>
        </div>
      </div>
    </Show>
  );
};

export default AppErrorBanner;

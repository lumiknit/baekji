import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { appErrors, dismissAppError } from '../state/errors.ts';
import { openBackupModal } from '../state/modal.ts';
import { s } from '../lib/i18n/index.ts';

const AppErrorBanner: Component = () => {
  const hasQuotaError = () =>
    appErrors().some((e) => e.kind === 'quota_exceeded');

  return (
    <Show when={hasQuotaError()}>
      <div class="app-error-banner">
        <span class="app-error-banner-msg">
          {s('errors.quota_exceeded_msg')}
        </span>
        <div class="flex gap-2 flex-shrink-0">
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

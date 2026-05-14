import type { Component } from 'solid-js';
import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { logs } from '../state/log';

const LogsPage: Component = () => {
  const handleCopy = () => {
    const text = logs().join('\n\n---\n\n');
    navigator.clipboard.writeText(text);
  };

  return (
    <div class="p-16 mt-32 max-w-720 m-auto">
      <div class="flex items-center justify-between gap-8">
        <h1 class="m-0">System Logs</h1>
        <div class="flex gap-8">
          <Show when={logs().length > 0}>
            <button class="btn-border btn-sm" onClick={handleCopy}>
              Copy All
            </button>
          </Show>
          <A href="/settings" class="btn-skeleton btn-sm">
            ← Settings
          </A>
        </div>
      </div>
      <p class="opacity-60 text-sm">
        Last {logs().length} entries (max 100). Share these when reporting
        issues.
      </p>
      <Show
        when={logs().length > 0}
        fallback={<p class="opacity-60">No errors recorded.</p>}
      >
        <div class="flex flex-column gap-8 mt-16">
          <For each={logs()}>
            {(entry) => (
              <pre
                class="log-entry"
                style={{
                  background: 'var(--bg2)',
                  padding: '8px 12px',
                  'border-radius': '4px',
                  'font-size': '0.75rem',
                  'white-space': 'pre-wrap',
                  'word-break': 'break-all',
                  margin: '0',
                }}
              >
                {entry}
              </pre>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default LogsPage;

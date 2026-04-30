import type { Component } from 'solid-js';
import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { logs } from '../state/log';

const LogsPage: Component = () => {
  return (
    <div class="p-16 mt-32 max-w-800 m-auto">
      <div class="flex items-center gap-8 mb-16">
        <A href="/" class="btn-border">
          ← Home
        </A>
        <h1 class="m-0">System Logs</h1>
      </div>

      <Show
        when={logs().length > 0}
        fallback={<div class="opacity-50 italic">No logs captured yet.</div>}
      >
        <div class="flex flex-column gap-8">
          <For each={logs()}>
            {(log) => (
              <pre
                class="p-8 btn-border m-0 overflow-x-hidden text-xs"
                style={{ 'white-space': 'pre-wrap', 'word-break': 'break-all' }}
              >
                {log}
              </pre>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default LogsPage;

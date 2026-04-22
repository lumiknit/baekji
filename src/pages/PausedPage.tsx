import type { Component } from 'solid-js';
import { useSearchParams, A } from '@solidjs/router';
import { s } from '../lib/i18n';

const PausedPage: Component = () => {
  const [searchParams] = useSearchParams();
  const pj = () => searchParams.pj;

  return (
    <div class="flex items-center justify-center min-h-screen p-24 text-center bg-bg color-text">
      <div class="max-w-400 p-32 border border-border rounded shadow-lg">
        <h1 class="text-xl font-bold mb-16">{s('paused.title')}</h1>
        <p class="text-sm opacity-70 leading-relaxed mb-24">
          {pj()
            ? s('paused.message_with_name', { name: decodeURIComponent(pj()!) })
            : s('paused.message_default')}
        </p>
        <A
          href="/"
          class="btn-border px-16 py-8 rounded font-bold inline-block"
        >
          {s('paused.go_home')}
        </A>
      </div>
    </div>
  );
};

export default PausedPage;

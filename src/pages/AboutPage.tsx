import type { Component } from 'solid-js';
import { A } from '@solidjs/router';
import { s } from '../lib/i18n';

const AboutPage: Component = () => {
  return (
    <div class="mt-32 p-16 max-w-800 m-auto">
      <h1>{__APP_NAME__}</h1>
      <p class="opacity-60">{s('home.subtitle')}</p>
      <p class="opacity-60">v{__APP_VERSION__}</p>
      <p>
        <a
          href="https://github.com/lumiknit/baekji"
          target="_blank"
          rel="noopener noreferrer"
        >
          github.com/lumiknit/baekji
        </a>
      </p>
      <hr class="separator-line" />
      <h3 class="m-0">{s('about.shortcuts_title')}</h3>
      <table class="shortcut-table">
        <tbody>
          {(
            [
              ['Ctrl / ⌘ + S', s('about.shortcut_save')],
              ['Ctrl / ⌘ + L', s('about.shortcut_sidebar')],
              ['Ctrl / ⌘ + Z', s('about.shortcut_undo')],
              ['Ctrl / ⌘ + Y', s('about.shortcut_redo')],
              ['Ctrl / ⌘ + B', s('about.shortcut_bold')],
              ['Ctrl / ⌘ + I', s('about.shortcut_italic')],
            ] as [string, string][]
          ).map(([key, desc]) => (
            <tr>
              <td>
                <kbd>{key}</kbd>
              </td>
              <td>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr class="separator-line" />
      <h3 class="m-0">Privacy</h3>
      <p class="opacity-60 text-sm">
        Baekji collects no data. Everything you write is stored only on this
        device using IndexedDB — no servers, no analytics, no third parties.
      </p>
      <p class="opacity-60 text-sm">
        If you clear your browser data, your content will be permanently lost.
        Use the backup feature regularly. When you export or share files, that
        data leaves the app and is outside our control.
      </p>
      <p class="text-sm">
        <a
          href="https://github.com/lumiknit/baekji/blob/master/PRIVACY.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          Full privacy policy →
        </a>
      </p>
      <hr class="separator-line" />
      <div class="flex gap-8">
        <A href="/" class="btn-skeleton">
          ← Home
        </A>
      </div>
    </div>
  );
};

export default AboutPage;

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
      <div class="flex gap-8">
        <A href="/" class="btn-skeleton">
          ← Home
        </A>
      </div>
    </div>
  );
};

export default AboutPage;

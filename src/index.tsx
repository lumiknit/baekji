/* @refresh reload */
import { render } from 'solid-js/web';

import './styles/index.css';

import App from './App.tsx';
import { initI18n } from './lib/i18n';

const root = document.getElementById('root');

// Render after i18n is ready
initI18n().then(() => {
  render(() => <App />, root!);
});

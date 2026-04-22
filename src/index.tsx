/* @refresh reload */
import { render } from 'solid-js/web';

import './styles/index.css';

import App from './App.tsx';
import { initI18n } from './lib/i18n';

const root = document.getElementById('root');

// i18n 초기화 후 렌더링
initI18n().then(() => {
  render(() => <App />, root!);
});

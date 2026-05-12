import type { Component } from 'solid-js';

interface ThemePreviewProps {
  label: string;
  themeClass: string;
  active: boolean;
  onClick: () => void;
}

const ThemePreview: Component<ThemePreviewProps> = (props) => (
  <button
    onClick={props.onClick}
    class={props.themeClass}
    style={{
      border: `2px solid ${props.active ? 'var(--text)' : 'var(--border)'}`,
      'border-radius': 'var(--r)',
      background: 'var(--bg)',
      color: 'var(--text)',
      padding: '8px 12px',
      cursor: 'pointer',
      display: 'flex',
      'flex-direction': 'column',
      gap: '4px',
      'min-width': '80px',
      outline: props.active ? '2px solid var(--text)' : 'none',
      'outline-offset': '2px',
    }}
  >
    <span style={{ 'font-size': '11px', 'font-weight': 'bold' }}>
      {props.label}
    </span>
    <div style={{ display: 'flex', gap: '3px' }}>
      <div
        style={{
          width: '12px',
          height: '4px',
          background: 'var(--border)',
          'border-radius': '2px',
        }}
      />
      <div
        style={{
          width: '20px',
          height: '4px',
          background: 'var(--text)',
          'border-radius': '2px',
          opacity: '0.5',
        }}
      />
    </div>
    <div style={{ display: 'flex', gap: '3px' }}>
      <div
        style={{
          width: '16px',
          height: '4px',
          background: 'var(--text)',
          'border-radius': '2px',
          opacity: '0.3',
        }}
      />
      <div
        style={{
          width: '14px',
          height: '4px',
          background: 'var(--text)',
          'border-radius': '2px',
          opacity: '0.3',
        }}
      />
    </div>
  </button>
);

export default ThemePreview;

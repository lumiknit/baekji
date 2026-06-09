import type { Component } from 'solid-js';

interface ThemePreviewProps {
  label: string;
  themePrefix: string; // e.g. "light-warm", "dark-cool"
  active: boolean;
  onClick: () => void;
}

const ThemePreview: Component<ThemePreviewProps> = (props) => {
  const v = (name: string) => `var(--thm-${props.themePrefix}-${name})`;

  return (
    <button
      onClick={props.onClick}
      style={{
        border: `2px solid ${props.active ? v('text') : v('border')}`,
        'border-radius': 'var(--r)',
        background: v('bg'),
        color: v('text'),
        padding: '8px 12px',
        cursor: 'pointer',
        display: 'flex',
        'flex-direction': 'column',
        gap: '4px',
        'min-width': '80px',
        outline: props.active ? `2px solid ${v('text')}` : 'none',
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
            background: v('border'),
            'border-radius': '2px',
          }}
        />
        <div
          style={{
            width: '20px',
            height: '4px',
            background: v('text'),
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
            background: v('text'),
            'border-radius': '2px',
            opacity: '0.3',
          }}
        />
        <div
          style={{
            width: '14px',
            height: '4px',
            background: v('text'),
            'border-radius': '2px',
            opacity: '0.3',
          }}
        />
      </div>
    </button>
  );
};

export default ThemePreview;

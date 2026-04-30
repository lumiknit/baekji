// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hexToHsl, nodeColorToCss } from './color';

describe('hexToHsl', () => {
  it('converts red', () => {
    const { h, s } = hexToHsl('#ff0000');
    expect(h).toBe(0);
    expect(s).toBe(100);
  });

  it('converts green', () => {
    const { h, s } = hexToHsl('#00ff00');
    expect(h).toBe(120);
    expect(s).toBe(100);
  });

  it('converts blue', () => {
    const { h, s } = hexToHsl('#0000ff');
    expect(h).toBe(240);
    expect(s).toBe(100);
  });

  it('returns s=0 for gray (achromatic)', () => {
    expect(hexToHsl('#808080').s).toBe(0);
    expect(hexToHsl('#ffffff').s).toBe(0);
    expect(hexToHsl('#000000').s).toBe(0);
  });
});

describe('nodeColorToCss', () => {
  it('returns undefined for no color', () => {
    expect(nodeColorToCss(undefined)).toBeUndefined();
  });

  it('returns undefined when s=0', () => {
    expect(nodeColorToCss({ h: 120, s: 0 })).toBeUndefined();
  });

  it('returns hsl string when s>0', () => {
    const result = nodeColorToCss({ h: 180, s: 60 });
    expect(result).toBe('hsl(180, 60%, var(--color-l, 40%))');
  });
});

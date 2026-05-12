// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { genOrderedId, genUnorderedId } from './uuid';

describe('genOrderedId', () => {
  it('returns a non-empty string', () => {
    expect(typeof genOrderedId()).toBe('string');
    expect(genOrderedId().length).toBeGreaterThan(0);
  });

  it('contains a hyphen separator', () => {
    expect(genOrderedId()).toContain('-');
  });

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, genOrderedId));
    expect(ids.size).toBe(100);
  });

  it('has timestamp as the leading segment (before the hyphen)', () => {
    const before = Date.now().toString(36);
    const id = genOrderedId();
    const after = Date.now().toString(36);
    const prefix = id.split('-')[0];
    expect(prefix >= before).toBe(true);
    expect(prefix <= after).toBe(true);
  });
});

describe('genUnorderedId', () => {
  it('returns a non-empty string', () => {
    expect(typeof genUnorderedId()).toBe('string');
    expect(genUnorderedId().length).toBeGreaterThan(0);
  });

  it('contains a hyphen separator', () => {
    expect(genUnorderedId()).toContain('-');
  });

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, genUnorderedId));
    expect(ids.size).toBe(100);
  });
});

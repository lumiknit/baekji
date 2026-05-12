// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatCompact } from './number';

describe('formatCompact', () => {
  it('formats small numbers as integers', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(42)).toBe('42');
    expect(formatCompact(999)).toBe('999');
  });

  it('formats thousands with k suffix', () => {
    expect(formatCompact(1000)).toBe('1.0k');
    expect(formatCompact(1500)).toBe('1.5k');
    expect(formatCompact(999999)).toBe('1000.0k');
  });

  it('formats millions with M suffix', () => {
    expect(formatCompact(1_000_000)).toBe('1.0M');
    expect(formatCompact(2_500_000)).toBe('2.5M');
  });

  it('formats billions with G suffix', () => {
    expect(formatCompact(1_000_000_000)).toBe('1.0G');
  });

  it('handles negative numbers', () => {
    expect(formatCompact(-500)).toBe('-500');
    expect(formatCompact(-1500)).toBe('-1.5k');
  });

  it('rounds small numbers', () => {
    expect(formatCompact(1.6)).toBe('2');
    expect(formatCompact(1.4)).toBe('1');
  });
});

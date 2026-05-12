// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bakTitleSlug } from './export';

describe('bakTitleSlug', () => {
  it('keeps alphanumeric and hyphens', () => {
    expect(bakTitleSlug('hello-world123')).toBe('hello-world123');
  });

  it('keeps unicode characters', () => {
    expect(bakTitleSlug('한글제목')).toBe('한글제목');
    expect(bakTitleSlug('日本語タイトル')).toBe('日本語タイトル');
  });

  it('replaces ASCII special chars with underscore', () => {
    expect(bakTitleSlug('hello world')).toBe('hello_world');
    expect(bakTitleSlug('foo/bar:baz')).toBe('foo_bar_baz');
    expect(bakTitleSlug('a[b]c{d}')).toBe('a_b_c_d');
    expect(bakTitleSlug('a@b')).toBe('a_b');
  });

  it('collapses consecutive special chars into one underscore', () => {
    expect(bakTitleSlug('hello   world')).toBe('hello_world');
    expect(bakTitleSlug('a!!b')).toBe('a_b');
  });

  it('trims trailing underscores', () => {
    expect(bakTitleSlug('hello!')).toBe('hello');
  });

  it('truncates to 16 characters', () => {
    expect(bakTitleSlug('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijklmnop');
  });

  it('truncates unicode within 16 chars', () => {
    const input = '가나다라마바사아자차카타파하가나다라';
    expect(bakTitleSlug(input).length).toBeLessThanOrEqual(16);
  });

  it('returns underscore for empty or all-special input', () => {
    expect(bakTitleSlug('')).toBe('_');
    expect(bakTitleSlug('!!!')).toBe('_');
  });

  it('handles control characters', () => {
    expect(bakTitleSlug('a\x00b\x1fc')).toBe('a_b_c');
    expect(bakTitleSlug('a\x7fb')).toBe('a_b');
  });
});

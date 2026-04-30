// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  calcStats,
  docToMarkdown,
  extractDocLabel,
  getShortLabel,
  markdownToDoc,
} from './pm_content';

describe('getShortLabel', () => {
  it('strips leading heading markers', () => {
    expect(getShortLabel('# Hello World')).toBe('Hello World');
    expect(getShortLabel('## Section')).toBe('Section');
  });

  it('trims whitespace', () => {
    expect(getShortLabel('  hello  ')).toBe('hello');
  });

  it('returns plain text as-is', () => {
    expect(getShortLabel('no heading here')).toBe('no heading here');
  });

  it('truncates to 200 characters', () => {
    const long = 'a'.repeat(300);
    expect(getShortLabel(long).length).toBe(200);
  });
});

describe('markdownToDoc / docToMarkdown', () => {
  it('round-trips plain text', () => {
    const md = 'hello world';
    const doc = markdownToDoc(md);
    expect(docToMarkdown(doc).trim()).toBe(md);
  });

  it('round-trips heading', () => {
    const md = '# Title';
    const doc = markdownToDoc(md);
    expect(docToMarkdown(doc).trim()).toBe(md);
  });

  it('round-trips bold text', () => {
    const md = '**bold**';
    const doc = markdownToDoc(md);
    expect(docToMarkdown(doc).trim()).toBe(md);
  });

  it('returns empty doc for invalid input without throwing', () => {
    expect(() => markdownToDoc('')).not.toThrow();
  });
});

describe('extractDocLabel', () => {
  it('extracts text from a doc', () => {
    const doc = markdownToDoc('Hello world');
    expect(extractDocLabel(doc)).toBe('Hello world');
  });

  it('respects maxLen', () => {
    const doc = markdownToDoc('a'.repeat(300));
    expect(extractDocLabel(doc, 50).length).toBeLessThanOrEqual(50);
  });
});

describe('calcStats', () => {
  it('counts chars and words in plain text node', () => {
    const docJSON = { content: [{ content: [{ text: 'hello world' }] }] };
    const stats = calcStats(docJSON);
    expect(stats.chars).toBe(10); // spaces excluded
    expect(stats.words).toBe(2);
  });

  it('returns zeros for empty doc', () => {
    expect(calcStats({})).toEqual({ chars: 0, words: 0 });
  });

  it('counts correctly across nested nodes', () => {
    // walkJSON does not reset inWord between sibling nodes,
    // so adjacent text nodes without whitespace count as one word
    const docJSON = {
      content: [
        { content: [{ text: 'foo ' }] },
        { content: [{ text: 'bar' }] },
      ],
    };
    const stats = calcStats(docJSON);
    expect(stats.chars).toBe(6);
    expect(stats.words).toBe(2);
  });

  it('counts a real markdownToDoc output', () => {
    const doc = markdownToDoc('one two three');
    const stats = calcStats(doc.toJSON());
    expect(stats.words).toBe(3);
    expect(stats.chars).toBe(11);
  });
});

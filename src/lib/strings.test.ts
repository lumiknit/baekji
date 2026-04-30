// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dedent } from './strings';

describe('dedent', () => {
  it('removes common leading indentation', () => {
    const result = dedent`
      hello
      world
    `;
    expect(result).toBe('hello\nworld');
  });

  it('preserves relative indentation', () => {
    const result = dedent`
      hello
        indented
      world
    `;
    expect(result).toBe('hello\n  indented\nworld');
  });

  it('interpolates values', () => {
    const name = 'Alice';
    const result = dedent`
      hello ${name}
      world
    `;
    expect(result).toBe('hello Alice\nworld');
  });

  it('handles single line', () => {
    const result = dedent`
      single
    `;
    expect(result).toBe('single');
  });

  it('strips only the outermost leading/trailing blank lines', () => {
    // inner blank line is preserved; only the first and last blank lines are stripped
    const result = dedent`

      content

    `;
    expect(result).toBe('\ncontent\n');
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isValidTag,
  parseQuery,
  evalExpr,
  matchQuery,
  extractAutoTags,
  type TagExpr,
  type ParseFail,
} from './query';

// ---------------------------------------------------------------------------
// isValidTag

describe('isValidTag', () => {
  it('accepts Korean, English, Arabic, Japanese, French tags', () => {
    expect(isValidTag('초안')).toBe(true);
    expect(isValidTag('novel')).toBe(true);
    expect(isValidTag('مسودة')).toBe(true);
    expect(isValidTag('下書き')).toBe(true);
    expect(isValidTag('brouillon')).toBe(true);
  });

  it('accepts non-reserved symbols: colon, hyphen, underscore, dot', () => {
    expect(isValidTag('scope:name')).toBe(true);
    expect(isValidTag('tag-1')).toBe(true);
    expect(isValidTag('tag_2')).toBe(true);
    expect(isValidTag('a.b')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidTag('')).toBe(false);
  });

  it('rejects reserved special characters', () => {
    for (const ch of ['&', '|', '(', ')', '*', '!']) {
      expect(isValidTag(`tag${ch}`)).toBe(false);
    }
  });

  it('rejects strings containing whitespace', () => {
    expect(isValidTag('my tag')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseQuery

describe('parseQuery', () => {
  it('empty string → all', () => {
    const r = parseQuery('');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.expr.type).toBe('all');
  });

  it('single tag literal', () => {
    const r = parseQuery('draft');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.expr).toEqual({ type: 'literal', tag: 'draft' });
  });

  it('glob pattern with prefix', () => {
    const r = parseQuery('work:*');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.expr).toEqual({ type: 'glob', prefix: 'work:' });
  });

  it('bare * → glob with empty prefix', () => {
    const r = parseQuery('*');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.expr).toEqual({ type: 'glob', prefix: '' });
  });

  it('NOT operator', () => {
    const r = parseQuery('!draft');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.expr).toEqual({ type: 'not', expr: { type: 'literal', tag: 'draft' } });
  });

  it('AND operator', () => {
    const r = parseQuery('draft&novel');
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.expr).toEqual({
        type: 'and',
        left: { type: 'literal', tag: 'draft' },
        right: { type: 'literal', tag: 'novel' },
      });
  });

  it('OR operator', () => {
    const r = parseQuery('draft|revision');
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.expr).toEqual({
        type: 'or',
        left: { type: 'literal', tag: 'draft' },
        right: { type: 'literal', tag: 'revision' },
      });
  });

  it('parenthesized group', () => {
    const r = parseQuery('!work:*&(draft|revision)');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.expr.type).toBe('and');
  });

  it('whitespace between tokens is ignored', () => {
    const r1 = parseQuery('draft & novel');
    const r2 = parseQuery('draft&novel');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) expect(r1.expr).toEqual(r2.expr);
  });

  it('missing closing paren → error', () => {
    const r = parseQuery('(draft');
    expect(r.ok).toBe(false);
  });

  it('operator only → error', () => {
    const r = parseQuery('&');
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evalExpr

describe('evalExpr', () => {
  const tags = (arr: string[]) => new Set(arr);

  it('all → always true', () => {
    expect(evalExpr({ type: 'all' }, tags([]))).toBe(true);
    expect(evalExpr({ type: 'all' }, tags(['a']))).toBe(true);
  });

  it('literal — present / absent', () => {
    expect(evalExpr({ type: 'literal', tag: 'draft' }, tags(['draft', 'novel']))).toBe(true);
    expect(evalExpr({ type: 'literal', tag: 'revision' }, tags(['draft', 'novel']))).toBe(false);
  });

  it('glob prefix — match / no match', () => {
    const expr: TagExpr = { type: 'glob', prefix: 'work:' };
    expect(evalExpr(expr, tags(['work:novel', 'draft']))).toBe(true);
    expect(evalExpr(expr, tags(['draft']))).toBe(false);
  });

  it('glob * — true if any tag exists', () => {
    const expr: TagExpr = { type: 'glob', prefix: '' };
    expect(evalExpr(expr, tags(['draft']))).toBe(true);
    expect(evalExpr(expr, tags([]))).toBe(false);
  });

  it('not', () => {
    const expr: TagExpr = { type: 'not', expr: { type: 'literal', tag: 'draft' } };
    expect(evalExpr(expr, tags(['novel']))).toBe(true);
    expect(evalExpr(expr, tags(['draft']))).toBe(false);
  });

  it('and', () => {
    const expr: TagExpr = {
      type: 'and',
      left: { type: 'literal', tag: 'draft' },
      right: { type: 'literal', tag: 'novel' },
    };
    expect(evalExpr(expr, tags(['draft', 'novel']))).toBe(true);
    expect(evalExpr(expr, tags(['draft']))).toBe(false);
  });

  it('or', () => {
    const expr: TagExpr = {
      type: 'or',
      left: { type: 'literal', tag: 'draft' },
      right: { type: 'literal', tag: 'revision' },
    };
    expect(evalExpr(expr, tags(['revision']))).toBe(true);
    expect(evalExpr(expr, tags(['novel']))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matchQuery (integration)

describe('matchQuery', () => {
  const t = (arr: string[]) => new Set(arr);

  it('single tag', () => {
    expect(matchQuery('draft', t(['draft']))).toBe(true);
    expect(matchQuery('draft', t(['novel']))).toBe(false);
  });

  it('glob prefix', () => {
    expect(matchQuery('work:*', t(['work:novel']))).toBe(true);
    expect(matchQuery('work:*', t(['draft']))).toBe(false);
  });

  it('!work:* & (draft | revision)', () => {
    const q = '!work:*&(draft|revision)';
    expect(matchQuery(q, t(['draft']))).toBe(true);
    expect(matchQuery(q, t(['revision']))).toBe(true);
    expect(matchQuery(q, t(['work:novel', 'draft']))).toBe(false); // work:* present
    expect(matchQuery(q, t(['novel']))).toBe(false);               // no draft/revision
  });

  it('empty query → matches everything', () => {
    expect(matchQuery('', t([]))).toBe(true);
    expect(matchQuery('', t(['anything']))).toBe(true);
  });

  it('parse error → false', () => {
    expect(matchQuery('(draft', t(['draft']))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractAutoTags

describe('extractAutoTags', () => {
  const parse = (q: string): TagExpr => {
    const r = parseQuery(q);
    if (!r.ok) throw new Error((r as ParseFail).error);
    return r.expr;
  };

  it('single tag', () => {
    expect(extractAutoTags(parse('draft'))).toEqual(['draft']);
  });

  it('AND → both sides collected', () => {
    expect(extractAutoTags(parse('draft&novel'))).toEqual(['draft', 'novel']);
  });

  it('OR → intersection of both sides (no common tag → [])', () => {
    expect(extractAutoTags(parse('draft|novel'))).toEqual([]);
  });

  it('OR with common AND tag → common tag only', () => {
    // (common&draft) | (common&revision) → intersection: ['common']
    expect(extractAutoTags(parse('(common&draft)|(common&revision)'))).toEqual(['common']);
  });

  it('NOT → empty', () => {
    expect(extractAutoTags(parse('!draft'))).toEqual([]);
  });

  it('!work:* & draft → [draft]', () => {
    expect(extractAutoTags(parse('!work:*&draft'))).toEqual(['draft']);
  });

  it('glob → empty', () => {
    expect(extractAutoTags(parse('work:*'))).toEqual([]);
  });

  it('empty query (all) → empty', () => {
    expect(extractAutoTags(parse(''))).toEqual([]);
  });
});

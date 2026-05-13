/**
 * Tag system — tag validation & filter query parser
 *
 * Tag rule:
 *   Any character except reserved special chars (&, |, (, ), *, !) and whitespace.
 *
 * Query grammar:
 *   expr        = term ( ('&' | '|') term )*
 *   term        = '!' term | '(' expr ')' | GLOB_PREFIX | TAG_LITERAL
 *   GLOB_PREFIX = tag '*'   (e.g. "work:*")
 *   TAG_LITERAL = tag
 *   empty query = match all
 */

// ---------------------------------------------------------------------------
// Tag validation

/** Characters forbidden in a tag: reserved operators, whitespace, and comma */
const INVALID_TAG_CHARS = /[&|()*!,\s]/;

export function isValidTag(tag: string): boolean {
  if (!tag || tag.length === 0) return false;
  return !INVALID_TAG_CHARS.test(tag);
}

/**
 * Convert arbitrary text into a valid canonical tag.
 * Runs of invalid chars (including existing underscores) collapse to a single '_',
 * leading/trailing underscores are stripped, and the result is lowercased.
 * Returns empty string if nothing remains.
 */
export function canonicalTag(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[&|()*!,\s_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ---------------------------------------------------------------------------
// AST

export type TagExpr =
  | { type: 'literal'; tag: string }
  | { type: 'glob'; prefix: string } // matches tags starting with prefix
  | { type: 'not'; expr: TagExpr }
  | { type: 'and'; left: TagExpr; right: TagExpr }
  | { type: 'or'; left: TagExpr; right: TagExpr }
  | { type: 'all' }; // empty query — matches everything

// ---------------------------------------------------------------------------
// Tokenizer

type Token =
  | { kind: 'tag'; value: string }
  | { kind: 'glob'; prefix: string }
  | { kind: 'op'; value: '&' | '|' | '!' }
  | { kind: 'paren'; value: '(' | ')' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input.trim();

  while (i < s.length) {
    const ch = s[i];

    if (ch === ' ' || ch === '\t' || ch === '\n') {
      // whitespace is ignored (no implicit AND — operators must be explicit)
      i++;
      continue;
    }

    if (ch === '&' || ch === '|' || ch === '!') {
      tokens.push({ kind: 'op', value: ch as '&' | '|' | '!' });
      i++;
      continue;
    }

    if (ch === '(' || ch === ')') {
      tokens.push({ kind: 'paren', value: ch as '(' | ')' });
      i++;
      continue;
    }

    if (ch === '*') {
      // bare '*' → glob with empty prefix (matches any tagged sheet)
      tokens.push({ kind: 'glob', prefix: '' });
      i++;
      continue;
    }

    // read tag characters
    let j = i;
    while (j < s.length && !/[&|()*!\s]/.test(s[j])) j++;
    const word = s.slice(i, j);
    i = j;

    if (i < s.length && s[i] === '*') {
      tokens.push({ kind: 'glob', prefix: word });
      i++;
    } else {
      tokens.push({ kind: 'tag', value: word });
    }
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Recursive-descent parser

type ParseState = { tokens: Token[]; pos: number };

function peek(s: ParseState): Token | undefined {
  return s.tokens[s.pos];
}

function consume(s: ParseState): Token {
  const t = s.tokens[s.pos++];
  if (!t) throw new Error('Unexpected end of input');
  return t;
}

function parseExpr(s: ParseState): TagExpr {
  let left = parseTerm(s);

  while (true) {
    const t = peek(s);
    if (!t) break;
    if (t.kind !== 'op' || (t.value !== '&' && t.value !== '|')) break;
    consume(s);
    const right = parseTerm(s);
    left =
      t.value === '&'
        ? { type: 'and', left, right }
        : { type: 'or', left, right };
  }

  return left;
}

function parseTerm(s: ParseState): TagExpr {
  const t = peek(s);
  if (!t) throw new Error('Expected term');

  if (t.kind === 'op' && t.value === '!') {
    consume(s);
    return { type: 'not', expr: parseTerm(s) };
  }

  if (t.kind === 'paren' && t.value === '(') {
    consume(s);
    const expr = parseExpr(s);
    const close = consume(s);
    if (close.kind !== 'paren' || close.value !== ')')
      throw new Error('Expected )');
    return expr;
  }

  if (t.kind === 'glob') {
    consume(s);
    return { type: 'glob', prefix: t.prefix };
  }

  if (t.kind === 'tag') {
    consume(s);
    if (!isValidTag(t.value)) throw new Error(`Invalid tag: "${t.value}"`);
    return { type: 'literal', tag: t.value };
  }

  throw new Error(`Unexpected token: ${JSON.stringify(t)}`);
}

// ---------------------------------------------------------------------------
// Public API

export type ParseOk = { ok: true; expr: TagExpr };
export type ParseFail = { ok: false; error: string };
export type ParseResult = ParseOk | ParseFail;

/** Parse a filter query string into an AST. Returns `{ type: 'all' }` for empty input. */
export function parseQuery(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, expr: { type: 'all' } };

  try {
    const tokens = tokenize(trimmed);
    const s: ParseState = { tokens, pos: 0 };
    const expr = parseExpr(s);
    if (s.pos < s.tokens.length) {
      return { ok: false, error: 'Unexpected token after expression' };
    }
    return { ok: true, expr };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// Evaluator

/** Returns true if the tag set satisfies the given expression. */
export function evalExpr(expr: TagExpr, tags: ReadonlySet<string>): boolean {
  switch (expr.type) {
    case 'all':
      return true;
    case 'literal':
      return tags.has(expr.tag);
    case 'glob':
      if (expr.prefix === '') return tags.size > 0; // '*' — true if any tag exists
      for (const t of tags) {
        if (t.startsWith(expr.prefix)) return true;
      }
      return false;
    case 'not':
      return !evalExpr(expr.expr, tags);
    case 'and':
      return evalExpr(expr.left, tags) && evalExpr(expr.right, tags);
    case 'or':
      return evalExpr(expr.left, tags) || evalExpr(expr.right, tags);
  }
}

/** Convenience wrapper: parse query then evaluate against a tag set. Returns false on parse error. */
export function matchQuery(query: string, tags: ReadonlySet<string>): boolean {
  const result = parseQuery(query);
  if (!result.ok) return false;
  return evalExpr(result.expr, tags);
}

// ---------------------------------------------------------------------------
// Auto-tag extraction for new sheet creation

/**
 * Extract the minimum set of positive literal tags that must be true for the
 * expression to hold. Used to pre-populate tags when creating a sheet under a filter.
 *
 * Rules:
 *   AND  → union of both sides
 *   OR   → intersection (tags common to both branches)
 *   NOT / glob / all → [] (cannot guarantee a specific literal)
 *
 * Examples:
 *   draft & novel  →  ['draft', 'novel']
 *   draft | revision  →  []  (no tag is guaranteed)
 *   !work:* & draft  →  ['draft']
 *   work:*  →  []
 */
export function extractAutoTags(expr: TagExpr): string[] {
  switch (expr.type) {
    case 'all':
    case 'glob':
    case 'not':
      return [];
    case 'literal':
      return [expr.tag];
    case 'and': {
      const l = extractAutoTags(expr.left);
      const r = extractAutoTags(expr.right);
      return [...l, ...r];
    }
    case 'or': {
      const l = extractAutoTags(expr.left);
      const r = new Set(extractAutoTags(expr.right));
      return l.filter((t) => r.has(t));
    }
  }
}

# i18n Rules

## 1. `s()` must always receive a literal string key

The audit script (`scripts/i18n`) detects usage by regex-matching `s('...')` or `s("...")`.
Dynamic keys break this detection and must never be used.

**Bad:**

```ts
s(`settings.theme_${variant}`); // template literal — not detected
s(someVariable); // variable — not detected
```

**Good:**

```ts
// Build a lookup table with literal keys, then index at runtime.
const THEME_LABELS: Record<string, string> = {
  default: s('settings.theme_default'),
  warm: s('settings.theme_warm'),
  cool: s('settings.theme_cool'),
};
label = THEME_LABELS[variant];
```

## 2. Errors that need localization: use `I18nError`

When library code needs to surface a user-visible i18n message via a thrown error,
use `makeI18nError(literalKey)` from `src/lib/sync/interface.ts`.
The catch site uses `isI18nError(err)` to resolve the key with `s(err.i18nKey)`.

**Bad:**

```ts
throw new Error('dropbox.error_pkce_missing'); // raw string used as key
// … catch …
const key = (err as any).message;
const msg = key.startsWith('dropbox.') ? s(key) : fallback; // dynamic s() call
```

**Good:**

```ts
// throw site
import { makeI18nError } from '../sync/interface';
throw makeI18nError('dropbox.error_pkce_missing');

// catch site
import { isI18nError } from '../sync/interface';
const msg = isI18nError(err)
  ? s(err.i18nKey)
  : s('dropbox.error_auth_callback');
```

## 3. Audit tool

```
cd scripts/i18n
go run main.go
```

Outputs to `scripts/i18n/_temp/`:

- `<lang>_flat.txt` — sorted flat key list for each locale JSON
- `used.txt` — keys found in `src/**/*.ts(x)` by regex
- `diff.txt` — keys missing from any source (locale files or source code)

Run after adding keys or removing features to catch dead/missing translations.

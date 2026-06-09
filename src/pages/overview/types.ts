import type { SheetMeta } from '../../lib/doc/v1.ts';

export type QueriedSheet = {
  meta: SheetMeta;
  getContent: () => Promise<string>;
};

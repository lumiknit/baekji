import { z } from 'zod/v4';

const csJSONKeep = z.number();
const csJSONReplace = z.tuple([z.number()], z.string());

export const changeSetJSONSchema = z.array(
  z.union([csJSONKeep, csJSONReplace]),
);
export type ChangeSetJSON = z.infer<typeof changeSetJSONSchema>;

// DeltaPayload: string = full snapshot, array = ChangeSet JSON.
export type DeltaPayload = ChangeSetJSON | string;

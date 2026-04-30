import { z } from 'zod/v4';
import { dedent } from '../strings';

/* Data structure for v0.
 * # Concept
 * - Bak...
 *   For Back-up file. This structure is not stored in the app, but only used
 *   for export and import.
 *   This must be validated with 'zod' before importing.
 * - Doc...
 *   This is for in-app data structure, more specifically, for IndexedDB.
 *   This also might be validated with 'zod' before loading, but not necessarilly.
 *   Only checking IndexedDB version might be enough,
 *   and when some field is changed uncompatibly, version must be increased.
 * - Other data structure is internal uses, without saving/validating.
 *
 * # Conversion
 *
 * - Bak is exported data, and Doc is in-app data.
 * - Both of them must be converted to JSON safely. (e.g. no circular, no function, etc.)
 * - When importing, Bak should be converted to Doc.
 * - When exporting, Doc should be converted to Bak.
 *
 * # Difference between Bak and Doc
 *
 * - Bak's 'project' is a single structure, but Doc split to 'ProjectItem' and 'ProjectVersion'.
 *   - For each project ID, multiple versions can exist.
 *   - 'ProjectItem' contains active version ID.
 *   - 'ProjectVersion' contains the actual content of the project.
 *   - In local changes, only single version will be used.
 *   - After importing, multiple version can exist.
 */

/** Schema version for v0 */
export const schemaVersion: number = 0;
const idSchema = z.string();

// Back-up structures

export const bakNodeCommonSchema = z.object({
  id: idSchema,
  label: z.string(),
  updatedAt: z.string(),
});

export const bakGroupNodeSchema = bakNodeCommonSchema.extend({
  type: z.literal('group'),
  children: z.array(z.string()).describe('IDs of child nodes'),
});

export const bakSheetNodeSchema = bakNodeCommonSchema.extend({
  type: z.literal('sheet'),
  content: z.string().describe('Markdown content of the sheet'),
});

export const bakNodeSchema = z.discriminatedUnion('type', [
  bakGroupNodeSchema,
  bakSheetNodeSchema,
]);
export type BakNode = z.infer<typeof bakNodeSchema>;

/**
 * Backup Project file schema.
 *
 * - Meta Fields: Metadata about the schema and app version, not instantiated for Doc.
 * - Identity Fields: Unique identifiers. Instantiated for 'ProjectItem' of Doc.
 * - Snapshot Fields: The actual content of the project. Instantiated to 'ProjectVersion' of Doc.
 */
export const bakProjectSchema = z.object({
  // Meta Fields

  $appVersion: z.string().describe(
    dedent`
		App version. This should be same as the app version in package.json.
		It might follows SemVer, but it is not strictly required.
		This is a reference for users to know which version of the app is used.
	`,
  ),
  $schemaVersion: z.literal(schemaVersion).describe(
    dedent`
		Schema version, which must be 0 for v0.
		This is used to distinguish different schema versions,
		and should be increased when there is an incompatible change in the schema.
	`,
  ),

  // Identity Fields

  $projectId: idSchema.describe(
    dedent`
		Project ID. This should be generated with UUID or something similar.
		It is used to distinguish projects' equality.
	`,
  ),

  // Snapshot Fields

  label: z.string().describe(
    dedent`
		Project label. This is a user-friendly name for the project.
	`,
  ),
  updatedAt: z.string().describe(
    dedent`
		Project's last updated time, in ISO string format.
	`,
  ),
  exportedAt: z.string().describe(
    dedent`
		Project's exported time, in ISO string format.
		This is used to know when the project is exported, and can be used for sorting.
	`,
  ),
  exportedBy: z.string().describe(
    dedent`
		Device ID who exported the project.
	`,
  ),
  nodes: z.array(bakNodeSchema).describe(
    dedent`
		Array of nodes in the project. Each node can be a group or a sheet.
	`,
  ),
  rootNodeId: idSchema.describe(
    dedent`
		ID of the root node. This is used to know which node is the root of the project.
	`,
  ),
});
export type BakProject = z.infer<typeof bakProjectSchema>;

// Doc structures

/**
 * Sheet Content (Snapshot)
 *
 * Key: 'id'. Index on 'nodeId'.
 * Created fresh on each hard save; id changes every time.
 */
export const sheetContentSchema = z.object({
  id: idSchema.describe('Unique snapshot ID, regenerated on each save'),
  nodeId: idSchema.describe('Node ID of the sheet node'),
  markdown: z.string().describe('Markdown serialized content'),
  selection: z
    .object({ anchor: z.number(), head: z.number() })
    .optional()
    .describe('Selection state'),
});
export type SheetContent = z.infer<typeof sheetContentSchema>;

/**
 * Sheet Delta
 *
 * Key: ['contentId', 'seq']. Index on 'contentId'.
 * Appended on each soft save; cleared on hard save.
 *
 * `changes` (CM6 ChangeSet).
 */
export const sheetDeltaSchema = z.object({
  contentId: idSchema.describe('ID of the corresponding SheetContent snapshot'),
  seq: z.number().describe('Sequence number starting from 0'),
  changes: z
    .unknown()
    .describe('CM6 ChangeSet.toJSON() — composed changes since last snapshot'),
  selection: z
    .object({ anchor: z.number(), head: z.number() })
    .describe('Selection state after changes applied'),
});
export type SheetDelta = z.infer<typeof sheetDeltaSchema>;

export const docNodeCommonSchema = z.object({
  id: idSchema,
  label: z.string(),
  updatedAt: z.string(),
});

export const docDataNodeCommonSchema = docNodeCommonSchema.extend({
  pjVerId: idSchema.describe('Node ID of versionRoot node of the project'),
  parentId: idSchema.describe(
    'Parent node ID, this should be projectVersion or group',
  ),
  orderKey: z.number().describe(
    dedent`
      Order of the node among siblings.
      This is fractional indexing in integers.
	`,
  ),

  visual: z.object({
    colorH: z.number().describe('Hue of the node color, in degrees (0-360)'),
    colorS: z
      .number()
      .describe('Saturation of the node color, in percentage (0-100)'),
  }),
  tags: z.array(z.string()).describe('Array of tags associated with the node'),
});

export const docGroupNodeSchema = docDataNodeCommonSchema.extend({
  type: z.literal('group'),
});
export type GroupNode = z.infer<typeof docGroupNodeSchema>;

export const docSheetNodeSchema = docDataNodeCommonSchema.extend({
  type: z.literal('sheet'),
});
export type SheetNode = z.infer<typeof docSheetNodeSchema>;

export const docVersionRootSchema = docNodeCommonSchema.extend({
  type: z.literal('versionRoot'),

  projectId: idSchema.describe('Project ID of the version root node'),

  active: z
    .boolean()
    .describe(
      'Whether this version is active or not. Only one version of the project ID can be active.',
    ),

  exportedAt: z
    .string()
    .optional()
    .describe(
      dedent`
		Original version exported time in ISO time format.
		This is non-null only if the version is imported one.
		`,
    ),
  exportedBy: z
    .string()
    .optional()
    .describe('Original version exported device ID'),
});

/**
 * Index:
 * - (id): Query with node ID
 * - (parentId): Query for group children
 * - (type): To query project list
 */
export const docNodeSchema = z.discriminatedUnion('type', [
  docGroupNodeSchema,
  docSheetNodeSchema,
  docVersionRootSchema,
]);
export type DocNode = z.infer<typeof docNodeSchema>;

// Extra data for IndexedDB
// These are not used to snapshot, but for UI or other purposes.

/**
 * App state data.
 * Unique index is combination of (scope, scopeId, key).
 */
export const stateKVSchema = z.object({
  scope: z
    .string()
    .describe('Scope of the state, e.g. "project", "sheet", etc.'),
  scopeId: idSchema.describe(
    'ID of the scope, e.g. project ID for "project" scope, node ID for "sheet" scope, etc.',
  ),
  key: z
    .string()
    .describe(
      'Key of the state, e.g. "activeVersionId", "lastOpenNodeId", etc.',
    ),
  value: z
    .unknown()
    .describe('Value of the state, can be any JSON-serializable value'),
  updatedAt: z
    .string()
    .describe('Last updated time of the state, in ISO string format'),
});
export type StateKV = z.infer<typeof stateKVSchema>;

// State Keys

export const SK_LAST_OPEN_NODE_ID = 'lastOpenNodeId'; // Node ID in string
export const SK_SHEET_LAST_SELECTION = 'sheetLastSelection'; // { anchor: number, focus: number }
export const SK_GROUP_COLLAPSED = 'groupCollapsed'; // boolean

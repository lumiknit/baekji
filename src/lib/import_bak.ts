/**
 * Shared logic for importing a backup blob/file into the local DB.
 * Used by ProjectList, BackupModal, and DropboxModal.
 */

import { useNavigate } from '@solidjs/router';
import { parseBak, prepareBakImport } from './doc/backup';
import { deserializeBak } from './doc/backup_helper';
import {
  getAllNodesInVersion,
  getActiveVersionRoot,
  setActiveVersion,
} from './doc/db';
import { commitBakImport } from './doc/db_helper';
import { schemaVersion } from './doc/v0';
import { showConfirm, showImportCompare } from '../state/modal';
import { s } from './i18n';
import type { VersionCompareMeta } from '../state/modal';
import { setActivePjVerId, setSidebarView } from '../state/workspace';

declare const __APP_VERSION__: string;

/**
 * Import a .gz or .json backup blob and navigate to the project when done.
 * Returns true if import succeeded.
 */
export async function importBakBlob(
  blob: Blob,
  filename: string,
  navigate: ReturnType<typeof useNavigate>,
  refetch?: () => void,
): Promise<boolean> {
  try {
    let raw: unknown;
    if (filename.endsWith('.gz')) {
      const bak = await deserializeBak(
        await blob.arrayBuffer().then((b) => new Uint8Array(b)),
      );
      raw = bak;
    } else {
      raw = JSON.parse(await blob.text());
    }

    const bak = parseBak(raw);
    const result = await prepareBakImport(bak);

    if (result.projectExists) {
      const existingRoot = await getActiveVersionRoot(result.projectId);
      const existingNodes = existingRoot
        ? await getAllNodesInVersion(existingRoot.id)
        : [];

      const existing: VersionCompareMeta = {
        label: existingRoot?.label ?? '',
        updatedAt: existingRoot?.updatedAt ?? '',
        exportedAt: existingRoot?.exportedAt,
        exportedBy: existingRoot?.exportedBy,
        appVersion: __APP_VERSION__,
        schemaVersion,
        sheetCount: existingNodes.filter((n) => n.type === 'sheet').length,
        groupCount: existingNodes.filter((n) => n.type === 'group').length,
      };

      const incomingNodes = bak.nodes;
      const incoming: VersionCompareMeta = {
        label: bak.label,
        updatedAt: bak.updatedAt,
        exportedAt: bak.exportedAt,
        exportedBy: bak.exportedBy,
        appVersion: bak.$appVersion,
        schemaVersion: bak.$schemaVersion,
        sheetCount: incomingNodes.filter((n) => n.type === 'sheet').length,
        groupCount: incomingNodes.filter(
          (n) => n.type === 'group' && n.id !== bak.rootNodeId,
        ).length,
      };

      const choice = await showImportCompare(existing, incoming);
      if (choice === 'cancel') return false;

      await commitBakImport(result);
      refetch?.();
      if (choice === 'overwrite') {
        await setActiveVersion(result.projectId, result.versionRoot.id);
        setActivePjVerId(result.versionRoot.id);
        setSidebarView('tree');
        navigate(`/nodes/${result.versionRoot.id}`);
      }
      return true;
    }

    await commitBakImport(result);
    await setActiveVersion(result.projectId, result.versionRoot.id);
    refetch?.();
    setActivePjVerId(result.versionRoot.id);
    setSidebarView('tree');
    navigate(`/nodes/${result.versionRoot.id}`);
    return true;
  } catch (err) {
    await showConfirm(s('import.error_title'), String(err));
    return false;
  }
}

/** Open a file picker and import the selected backup. */
export function openImportBakDialog(
  navigate: ReturnType<typeof useNavigate>,
  refetch?: () => void,
): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.gz';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await importBakBlob(file, file.name, navigate, refetch);
  };
  input.click();
}

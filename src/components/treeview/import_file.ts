import toast from 'solid-toast';
import { parseBak, prepareBakImport } from '../../lib/doc/backup';
import { commitBakImport, importTextAsSheet } from '../../lib/doc/db_helper';
import { fetchProjectTree, projectTree } from '../../state/project_tree';
import { showConfirm } from '../../state/modal';

export function openImportFileDialog(parentId: string): void {
  const pjVerId = projectTree.meta?.pjVerId ?? parentId;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.md,.txt,.json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    if (file.name.endsWith('.json')) {
      try {
        const bak = parseBak(JSON.parse(text));
        const result = await prepareBakImport(bak);
        await commitBakImport(result);
      } catch (err) {
        await showConfirm('Import failed', String(err));
        return;
      }
    } else {
      try {
        await importTextAsSheet(text, file.name, pjVerId, parentId);
      } catch (err: any) {
        toast.error(`Import failed: ${err?.message ?? String(err)}`);
        return;
      }
    }
    await fetchProjectTree(pjVerId);
  };
  input.click();
}

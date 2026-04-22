import type { Component } from 'solid-js';
import { For } from 'solid-js';
import { s } from '../../lib/i18n';
import { closeModal } from '../../state/modal';
import type { VersionCompareMeta } from '../../state/modal';
import { deviceId } from '../../state/workspace';

interface Props {
  existing: VersionCompareMeta;
  incoming: VersionCompareMeta;
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function fmtStr(v?: string | number): string {
  return v !== undefined && v !== '' ? String(v) : '—';
}

function fmtDevice(v?: string): string {
  if (!v || v === '') return '—';
  if (v === deviceId())
    return `${v.slice(0, 8)}… (${s('project.this_device')})`;
  return v.slice(0, 8) + '…';
}

const ImportCompareModal: Component<Props> = (props) => {
  const rows = () => [
    {
      label: s('home.import_row_label'),
      ex: fmtStr(props.existing.label),
      inc: fmtStr(props.incoming.label),
    },
    {
      label: s('home.import_row_updated_at'),
      ex: fmtDate(props.existing.updatedAt),
      inc: fmtDate(props.incoming.updatedAt),
    },
    {
      label: s('home.import_row_exported_at'),
      ex: fmtDate(props.existing.exportedAt),
      inc: fmtDate(props.incoming.exportedAt),
    },
    {
      label: s('home.import_row_exported_by'),
      ex: fmtDevice(props.existing.exportedBy),
      inc: fmtDevice(props.incoming.exportedBy),
    },
    {
      label: s('home.import_row_app_version'),
      ex: fmtStr(props.existing.appVersion),
      inc: fmtStr(props.incoming.appVersion),
    },
    {
      label: s('home.import_row_schema_version'),
      ex: fmtStr(props.existing.schemaVersion),
      inc: fmtStr(props.incoming.schemaVersion),
    },
    {
      label: s('home.import_row_sheets'),
      ex: String(props.existing.sheetCount),
      inc: String(props.incoming.sheetCount),
    },
    {
      label: s('home.import_row_groups'),
      ex: String(props.existing.groupCount),
      inc: String(props.incoming.groupCount),
    },
  ];

  return (
    <>
      <h3>{s('home.import_duplicate_title')}</h3>
      <p class="opacity-60 text-base">{s('home.import_duplicate_desc')}</p>

      <table class="import-compare-table">
        <thead>
          <tr>
            <th />
            <th>{s('home.import_col_existing')}</th>
            <th>{s('home.import_col_incoming')}</th>
          </tr>
        </thead>
        <tbody>
          <For each={rows()}>
            {(row) => (
              <tr>
                <td class="import-compare-key">{row.label}</td>
                <td>{row.ex}</td>
                <td class={row.inc !== row.ex ? 'import-compare-diff' : ''}>
                  {row.inc}
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>

      <div class="modal-actions">
        <button class="btn-secondary" onClick={() => closeModal('cancel')}>
          {s('common.cancel')}
        </button>
        <button class="btn-border" onClick={() => closeModal('separate')}>
          {s('home.import_separate')}
        </button>
        <button class="btn-primary" onClick={() => closeModal('overwrite')}>
          {s('home.import_overwrite')}
        </button>
      </div>
    </>
  );
};

export default ImportCompareModal;

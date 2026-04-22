import { useNavigate } from '@solidjs/router';
import type { Component } from 'solid-js';
import {
  createEffect,
  createResource,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import {
  TbOutlineAlignJustified,
  TbOutlineArrowBackUp,
  TbOutlineArrowForwardUp,
  TbOutlineBold,
  TbOutlineCode,
  TbOutlineDeviceFloppy,
  TbOutlineH1,
  TbOutlineH2,
  TbOutlineH3,
  TbOutlineH4,
  TbOutlineItalic,
  TbOutlineList,
  TbOutlineListNumbers,
  TbOutlineQuote,
  TbOutlineSourceCode,
  TbOutlineStrikethrough,
  TbOutlineTextDecrease,
} from 'solid-icons/tb';
import { setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import { undo, redo } from 'prosemirror-history';
import { wrapInList } from 'prosemirror-schema-list';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  deleteSheetDraft,
  getNode,
  getSheetSelection,
  putNode,
  putSheetContent,
  putSheetDraft,
  setSheetSelection,
} from '../../lib/doc/db';
import { getSheetContentAsJSON } from '../../lib/doc/db_helper';
import { s } from '../../lib/i18n';
import { updateSheetMeta } from '../../state/project_tree';
import { settings } from '../../state/settings';
import Dropdown from '../Dropdown';
import { buildPlugins, calcStats, pmSchema, pmSerializer } from './helpers';

interface EditorProps {
  sheetId: string;
}

const Editor: Component<EditorProps> = (props) => {
  const navigate = useNavigate();
  let editorRef: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let saveInFlight = false;
  let savingGaugeRef: HTMLSpanElement | undefined;

  const [sheet] = createResource(
    () => props.sheetId,
    async (id) => {
      const node = await getNode(id);
      if (!node || node.type !== 'sheet') return undefined;
      const contentJSON = await getSheetContentAsJSON(id);
      const sel = await getSheetSelection(id);
      return { node, contentJSON, selection: sel };
    },
  );
  const [isDirty, setIsDirty] = createSignal(false);
  const [lastSaved, setLastSaved] = createSignal<Date | null>(null);
  const [stats, setStats] = createSignal({ chars: 0, words: 0 });

  const updateStats = (docJSON: unknown) => setStats(calcStats(docJSON));

  const getPlugins = () =>
    buildPlugins(s('editor.placeholder'), settings.mdRules ?? ({} as any));

  // Autosave: persist ProseMirror JSON to draft (no serialization cost)
  const saveDraft = async () => {
    if (!view || !isDirty() || saveInFlight) return;
    saveInFlight = true;
    try {
      const data = sheet();
      if (data) {
        const docJSON = view.state.doc.toJSON();
        await putSheetDraft(data.node.id, docJSON);
        updateStats(docJSON);
        setIsDirty(false);
        setLastSaved(new Date());
      }
    } finally {
      saveInFlight = false;
    }
  };

  // Full save: serialize to markdown, update sheetContent + node label, clear draft
  const freeze = async () => {
    if (!view || saveInFlight) return;
    saveInFlight = true;
    try {
      const data = sheet();
      if (data) {
        const { node } = data;
        const content = pmSerializer.serialize(view.state.doc);
        const firstLine = content.split('\n').find((l) => l.trim()) ?? '';
        const autoLabel = firstLine.replace(/^#+\s*/, '').slice(0, 60);
        const { anchor, head } = view.state.selection;
        const now = new Date().toISOString();
        await putSheetContent(node.id, content);
        await deleteSheetDraft(node.id);
        await putNode({ ...node, label: autoLabel, updatedAt: now });
        await setSheetSelection(node.id, { anchor, head });
        updateSheetMeta(node.id, autoLabel, content.slice(0, 200));
        setIsDirty(false);
        setLastSaved(new Date());
        updateStats(view.state.doc.toJSON());
      }
    } finally {
      saveInFlight = false;
    }
  };

  let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  const triggerAutosave = () => {
    clearTimeout(autosaveTimer);
    const intervalTime = Math.max(1, settings.autosaveInterval) * 1000;
    autosaveTimer = setTimeout(saveDraft, intervalTime);
    if (savingGaugeRef) {
      savingGaugeRef.style.animation = 'none';
      void savingGaugeRef.offsetWidth;
      savingGaugeRef.style.animation = `editor-gauge-fill ${intervalTime}ms linear forwards`;
    }
  };

  const applySheetToView = (data: NonNullable<ReturnType<typeof sheet>>) => {
    if (!view) return;
    const doc = pmSchema.nodeFromJSON(data.contentJSON);
    const docSize = doc.content.size;
    const saved = data.selection;
    const anchor = Math.min(saved?.anchor ?? docSize, docSize);
    const head = Math.min(saved?.head ?? anchor, docSize);
    const selection = TextSelection.create(doc, anchor, head);
    view.updateState(
      EditorState.create({
        doc,
        schema: pmSchema,
        plugins: getPlugins(),
        selection,
      }),
    );
    view.focus();
    view.dispatch(view.state.tr.scrollIntoView());
    setIsDirty(false);
    setLastSaved(new Date(data.node.updatedAt));
    updateStats(doc.toJSON());
  };

  onMount(() => {
    if (!editorRef) return;
    view = new EditorView(editorRef, {
      state: EditorState.create({ schema: pmSchema, plugins: getPlugins() }),
      dispatchTransaction(tr) {
        const newState = view!.state.apply(tr);
        view!.updateState(newState);
        if (tr.docChanged) {
          setIsDirty(true);
          triggerAutosave();
        }
      },
      handleDOMEvents: {
        blur: () => {
          saveDraft();
          return false;
        },
      },
    });

    const data = sheet();
    if (data) applySheetToView(data);

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty()) e.preventDefault();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        freeze();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleKeyDown);
    });
  });

  createEffect(() => {
    const data = sheet();
    if (data && view) applySheetToView(data);
  });

  createEffect(() => {
    JSON.stringify(settings.mdRules); // track
    if (!view) return;
    view.updateState(view.state.reconfigure({ plugins: getPlugins() }));
  });

  onCleanup(() => {
    clearTimeout(autosaveTimer);
    freeze();
    view?.destroy();
  });

  const exec = (
    cmd: (state: EditorState, dispatch: (tr: any) => void) => boolean,
  ) => {
    if (view) {
      cmd(view.state, view.dispatch);
      view.focus();
    }
  };

  return (
    <div class="editor-container">
      <div class="editor-toolbar">
        <button onClick={() => exec(undo)} title="Undo">
          <TbOutlineArrowBackUp />
        </button>
        <button onClick={() => exec(redo)} title="Redo">
          <TbOutlineArrowForwardUp />
        </button>

        <div class="separator" />

        <button
          onClick={() => exec(toggleMark(pmSchema.marks.strong))}
          title="Bold"
        >
          <TbOutlineBold />
        </button>
        <button
          onClick={() => exec(toggleMark(pmSchema.marks.em))}
          title="Italic"
        >
          <TbOutlineItalic />
        </button>

        <Dropdown
          trigger={<TbOutlineStrikethrough />}
          items={[
            {
              label: (
                <>
                  <TbOutlineStrikethrough /> Strikethrough
                </>
              ),
              onSelect: () => exec(toggleMark(pmSchema.marks.strikethrough)),
            },
            {
              label: (
                <>
                  <TbOutlineCode /> Monospace
                </>
              ),
              onSelect: () => exec(toggleMark(pmSchema.marks.code)),
            },
            {
              label: (
                <>
                  <TbOutlineTextDecrease /> Clear styles
                </>
              ),
              onSelect: () => {
                if (!view) return;
                const { from, to } = view.state.selection;
                exec((state, dispatch) => {
                  if (dispatch) dispatch(state.tr.removeMark(from, to));
                  return true;
                });
              },
            },
          ]}
        />

        <div class="separator" />

        <Dropdown
          trigger={<TbOutlineH1 />}
          items={[
            {
              label: (
                <>
                  <TbOutlineH1 /> H1
                </>
              ),
              onSelect: () =>
                exec(setBlockType(pmSchema.nodes.heading, { level: 1 })),
            },
            {
              label: (
                <>
                  <TbOutlineH2 /> H2
                </>
              ),
              onSelect: () =>
                exec(setBlockType(pmSchema.nodes.heading, { level: 2 })),
            },
            {
              label: (
                <>
                  <TbOutlineH3 /> H3
                </>
              ),
              onSelect: () =>
                exec(setBlockType(pmSchema.nodes.heading, { level: 3 })),
            },
            {
              label: (
                <>
                  <TbOutlineH4 /> H4
                </>
              ),
              onSelect: () =>
                exec(setBlockType(pmSchema.nodes.heading, { level: 4 })),
            },
            {
              label: (
                <>
                  <TbOutlineAlignJustified /> Paragraph
                </>
              ),
              onSelect: () => exec(setBlockType(pmSchema.nodes.paragraph)),
            },
          ]}
        />

        <Dropdown
          trigger={<TbOutlineList />}
          items={[
            {
              label: (
                <>
                  <TbOutlineList /> Bullet list
                </>
              ),
              onSelect: () => exec(wrapInList(pmSchema.nodes.bullet_list)),
            },
            {
              label: (
                <>
                  <TbOutlineListNumbers /> Ordered list
                </>
              ),
              onSelect: () => exec(wrapInList(pmSchema.nodes.ordered_list)),
            },
            {
              label: (
                <>
                  <TbOutlineQuote /> Quote
                </>
              ),
              onSelect: () => exec(wrapIn(pmSchema.nodes.blockquote)),
            },
            {
              label: (
                <>
                  <TbOutlineSourceCode /> Code block
                </>
              ),
              onSelect: () => exec(setBlockType(pmSchema.nodes.code_block)),
            },
          ]}
        />

        <button
          class="btn-border save-btn"
          style={{ 'margin-left': 'auto', 'flex-shrink': '0' }}
          onClick={freeze}
          disabled={!isDirty()}
        >
          <TbOutlineDeviceFloppy />
          <span class="hidden-mobile">{s('common.save')}</span>
        </button>
      </div>

      <div ref={editorRef} class="prosemirror-editor typo" />

      <div class="editor-stats-overlay">
        <Show
          when={!isDirty()}
          fallback={
            <span
              ref={(el) => {
                savingGaugeRef = el;
                if (el) {
                  const ms = Math.max(1, settings.autosaveInterval) * 1000;
                  el.style.animation = `editor-gauge-fill ${ms}ms linear forwards`;
                }
              }}
              class="editor-saving-gauge"
            />
          }
        >
          <span class="editor-saved-time">
            {lastSaved()
              ? lastSaved()!.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : ''}
          </span>
          <button
            class="editor-stats-btn"
            onClick={() => navigate(`/nodes/${props.sheetId}/analysis`)}
          >
            <span>{s('editor.chars', { count: stats().chars })}</span>
            <span>{s('editor.words', { count: stats().words })}</span>
          </button>
        </Show>
      </div>
    </div>
  );
};

export default Editor;

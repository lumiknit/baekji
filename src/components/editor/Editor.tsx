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
import { Step } from 'prosemirror-transform';
import { getNode, putNode } from '../../lib/doc/db';
import { loadSheetState, softSave, hardSave } from '../../lib/doc/db_helper';
import { s } from '../../lib/i18n';
import { updateSheetMeta } from '../../state/project_tree';
import { settings } from '../../state/settings';
import Dropdown from '../Dropdown';
import CircularProgress from '../CircularProgress';
import { buildPlugins, calcStats, pmSchema } from './helpers';
import { buildOptimizedStepJSONs } from './step_helper';

const SOFT_SAVE_STEP_LIMIT = 128;

interface EditorProps {
  sheetId: string;
}

const Editor: Component<EditorProps> = (props) => {
  const navigate = useNavigate();
  let editorRef: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let saveInFlight = false;

  // Step buffer for soft save
  let stepBuffer: Step[] = [];
  let currentSeq = 0;

  const [sheet] = createResource(
    () => props.sheetId,
    async (id) => {
      const node = await getNode(id);
      if (!node || node.type !== 'sheet') return undefined;
      const state = await loadSheetState(id);
      return {
        node,
        contentJSON: state.pmJSON,
        selection: state.selection,
        state,
      };
    },
  );
  const [isDirty, setIsDirty] = createSignal(false);
  const [lastSaved, setLastSaved] = createSignal<Date | null>(null);
  const [stats, setStats] = createSignal({ chars: 0, words: 0 });
  const [statsExact, setStatsExact] = createSignal(false);
  const [autosaveEndTime, setAutosaveEndTime] = createSignal<Date | null>(null);

  const updateStats = (docJSON: unknown) => {
    setStats(calcStats(docJSON));
    setStatsExact(true);
  };

  const getPlugins = () =>
    buildPlugins(s('editor.placeholder'), settings.mdRules ?? ({} as any));

  // Soft save: flush step buffer to IDB
  const flushStepBuffer = () => {
    if (!view || stepBuffer.length === 0 || saveInFlight) return;
    const data = sheet();
    if (!data) return;

    const steps = buildOptimizedStepJSONs(stepBuffer);
    stepBuffer = [];
    const seq = currentSeq++;
    const { anchor, head } = view.state.selection;
    const nodeId = data.node.id;

    saveInFlight = true;
    setAutosaveEndTime(null);
    void (async () => {
      try {
        await softSave(nodeId, steps, { anchor, head }, seq);
        setIsDirty(false);
        setLastSaved(new Date());
      } finally {
        saveInFlight = false;
      }
    })();
  };

  // Hard save: create new snapshot, clear deltas, update node label
  const freeze = () => {
    if (!view || saveInFlight) return;
    const data = sheet();
    if (!data) return;

    // Flush any buffered steps into the current doc JSON for hard save
    const docJSON = view.state.doc.toJSON();
    const { anchor, head } = view.state.selection;
    const { node } = data;
    const now = new Date().toISOString();

    stepBuffer = []; // discard buffered steps — hard save uses full doc
    saveInFlight = true;
    setAutosaveEndTime(null);
    void (async () => {
      try {
        const { markdown, autoLabel } = await hardSave(node.id, docJSON, {
          anchor,
          head,
        });
        await putNode({ ...node, label: autoLabel, updatedAt: now });
        updateSheetMeta(node.id, autoLabel, markdown.slice(0, 200));
        updateStats(docJSON);
        setIsDirty(false);
        setLastSaved(new Date());
      } finally {
        saveInFlight = false;
      }
    })();
  };

  let softSaveTimer: ReturnType<typeof setTimeout> | undefined;
  const triggerSoftSave = () => {
    clearTimeout(softSaveTimer);
    setAutosaveEndTime(new Date(Date.now() + settings.autosaveInterval * 1000));
    softSaveTimer = setTimeout(
      flushStepBuffer,
      settings.autosaveInterval * 1000,
    );
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

    // Restore seq state from loaded sheet
    currentSeq = data.state.nextSeq;
    stepBuffer = [];

    view.focus();
    view.dispatch(view.state.tr.scrollIntoView());
    setIsDirty(false);
    setLastSaved(new Date(data.node.updatedAt));
    updateStats(doc.toJSON());

    // Hard save on first open if there are pending deltas
    if (data.state.nextSeq > 0) {
      freeze();
    }
  };

  onMount(() => {
    if (!editorRef) return;
    view = new EditorView(editorRef, {
      state: EditorState.create({ schema: pmSchema, plugins: getPlugins() }),
      dispatchTransaction(tr) {
        const newState = view!.state.apply(tr);
        view!.updateState(newState);
        if (tr.docChanged) {
          stepBuffer.push(...tr.steps);
          setStatsExact(false);
          setIsDirty(true);
          if (stepBuffer.length >= SOFT_SAVE_STEP_LIMIT) {
            flushStepBuffer();
          } else {
            triggerSoftSave();
          }
        }
      },
      handleDOMEvents: {
        blur: () => {
          flushStepBuffer();
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
    clearTimeout(softSaveTimer);
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
        <div class="flex items-center gap-12">
          <Show when={isDirty()}>
            <CircularProgress
              endTime={autosaveEndTime()}
              size={14}
              strokeWidth={0.4}
            />
          </Show>
          <Show when={!isDirty() && lastSaved()}>
            <span class="editor-saved-time">
              {lastSaved()!.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          </Show>
          <button
            class="editor-stats-btn"
            style={{ opacity: statsExact() ? '1' : '0.3' }}
            onClick={() => navigate(`/nodes/${props.sheetId}/analysis`)}
          >
            <span>{s('editor.chars', { count: stats().chars })}</span>
            <span>{s('editor.words', { count: stats().words })}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Editor;

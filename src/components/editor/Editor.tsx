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
import { undo, redo, undoDepth, redoDepth } from 'prosemirror-history';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Step } from 'prosemirror-transform';
import { getNode, putNode } from '../../lib/doc/db';
import { loadSheetState, softSave, hardSave } from '../../lib/doc/db_helper';
import { s } from '../../lib/i18n';
import { updateSheetMeta } from '../../state/project_tree';
import { settings } from '../../state/settings';
import CircularProgress from '../CircularProgress';
import { buildPlugins, pmSchema } from './helpers';
import { formatCompact } from '../../lib/number';
import { buildOptimizedStepJSONs } from './step_helper';
import toast from 'solid-toast';
import EditorToolbar from './EditorToolbar';

import 'prosemirror-view/style/prosemirror.css';

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
  const [canUndo, setCanUndo] = createSignal(false);
  const [canRedo, setCanRedo] = createSignal(false);

  const updateHistoryState = (state: EditorState) => {
    setCanUndo(undoDepth(state) > 0);
    setCanRedo(redoDepth(state) > 0);
  };
  const [lastSaved, setLastSaved] = createSignal<Date | null>(null);
  const [nodeSize, setNodeSize] = createSignal(0);
  const [autosaveEndTime, setAutosaveEndTime] = createSignal<Date | null>(null);

  const getPlugins = () =>
    buildPlugins(s('editor.placeholder'), settings.mdRules ?? ({} as any));

  // Soft save: flush step buffer to IDB
  const flushStepBuffer = () => {
    if (!view || stepBuffer.length === 0) return;
    if (saveInFlight) {
      toast.error(s('editor.saveBusy'));
      return;
    }
    const data = sheet();
    if (!data) return;

    const steps = buildOptimizedStepJSONs(stepBuffer);
    stepBuffer = [];
    const seq = currentSeq++;
    const { anchor, head } = view.state.selection;
    const { node } = data;
    const doc = view.state.doc;
    const rawLabel =
      doc
        .textBetween(0, Math.min(doc.content.size, 500), '\n')
        .split('\n')
        .find((l) => l.trim()) ?? '';
    const autoLabel = rawLabel.trim().slice(0, 60);
    const now = new Date().toISOString();

    saveInFlight = true;
    setAutosaveEndTime(null);
    void (async () => {
      try {
        await softSave(node.id, steps, { anchor, head }, seq);
        if (autoLabel && autoLabel !== node.label) {
          await putNode({ ...node, label: autoLabel, updatedAt: now });
          updateSheetMeta(node.id, autoLabel, autoLabel);
        }
        setIsDirty(false);
        setLastSaved(new Date());
      } finally {
        saveInFlight = false;
      }
    })();
  };

  // Hard save: create new snapshot, clear deltas, update node label
  const freeze = () => {
    if (!view) return;
    if (saveInFlight) {
      toast.error(s('editor.saveBusy'));
      return;
    }
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
    updateHistoryState(view.state);
    setNodeSize(doc.nodeSize);
    setIsDirty(false);
    setLastSaved(new Date(data.node.updatedAt));

    if (data.state.partialLoad) {
      toast.error(s('editor.deltaCorrupt'), { duration: 6000 });
    }

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
        updateHistoryState(newState);
        if (tr.docChanged) {
          setNodeSize(newState.doc.nodeSize);
          stepBuffer.push(...tr.steps);
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
    flushStepBuffer();
    view?.destroy();
  });

  const exec = (
    cmd: (state: EditorState, dispatch: (tr: any) => void) => boolean,
  ) => {
    if (view) {
      try {
        cmd(view.state, view.dispatch);
      } catch (e) {
        console.warn('editor cmd failed:', e);
      }
      view.focus();
    }
  };

  return (
    <div class="editor-container">
      <EditorToolbar
        canUndo={canUndo()}
        canRedo={canRedo()}
        isDirty={isDirty()}
        onUndo={() => exec(undo)}
        onRedo={() => exec(redo)}
        onExec={exec}
        onSave={freeze}
      />

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
            onClick={() => navigate(`/nodes/${props.sheetId}/analysis`)}
          >
            <span>
              {s('editor.size', { count: formatCompact(nodeSize()) })}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Editor;

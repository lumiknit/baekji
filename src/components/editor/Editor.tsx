import { useNavigate } from '@solidjs/router';
import { TbOutlineCircleCheck } from 'solid-icons/tb';
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
import {
  createTreeNode,
  deleteTreeNode,
  projectTree,
  updateSheetMeta,
} from '../../state/project_tree';
import { settings } from '../../state/settings';
import CircularProgress from '../CircularProgress';
import { buildPlugins, extractDocLabel, pmSchema } from './helpers';
import { formatCompact } from '../../lib/number';
import { buildOptimizedStepJSONs } from './step_helper';
import toast from 'solid-toast';
import EditorToolbar from './EditorToolbar';
import { showConfirm, showImage, showLink } from '../../state/modal';

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
  let deltaStepCount = 0;

  const DELTA_HARD_SAVE_THRESHOLD = 256;

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
    const autoLabel = extractDocLabel(doc);
    const now = new Date().toISOString();

    saveInFlight = true;
    setAutosaveEndTime(null);
    void (async () => {
      try {
        await softSave(node.id, steps, { anchor, head }, seq);
        deltaStepCount += steps.length;
        if (autoLabel && autoLabel !== node.label) {
          await putNode({ ...node, label: autoLabel, updatedAt: now });
          updateSheetMeta(node.id, autoLabel, autoLabel);
        }
        setIsDirty(false);
        setLastSaved(new Date());
        if (deltaStepCount >= DELTA_HARD_SAVE_THRESHOLD) {
          freeze();
        }
      } catch (err) {
        console.error('Soft save failed:', err);
        toast.error(s('editor.saveFailed'));
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
    deltaStepCount = 0;
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
      } catch (err) {
        console.error('Hard save failed:', err);
        toast.error(s('editor.saveFailed'));
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
    deltaStepCount = 0;

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
      handleClick(v, pos) {
        const linkMark = pmSchema.marks.link;
        const $pos = v.state.doc.resolve(pos);
        const link = $pos.marks().find((m) => m.type === linkMark);
        if (!link) return false;

        // Find range of this link mark
        const doc = v.state.doc;
        let from = pos,
          to = pos;
        while (
          from > 0 &&
          doc
            .resolve(from - 1)
            .marks()
            .some(
              (m) => m.type === linkMark && m.attrs.href === link.attrs.href,
            )
        )
          from--;
        while (
          to < doc.content.size &&
          doc
            .resolve(to)
            .marks()
            .some(
              (m) => m.type === linkMark && m.attrs.href === link.attrs.href,
            )
        )
          to++;

        void showLink(link.attrs.href as string).then((url) => {
          if (url === null) return;
          const tr = v.state.tr;
          if (url === '') tr.removeMark(from, to, linkMark);
          else tr.addMark(from, to, linkMark.create({ href: url }));
          v.dispatch(tr);
          v.focus();
        });
        return true;
      },
      handleDoubleClick(v, pos) {
        const node = v.state.doc.nodeAt(pos);
        if (node?.type !== pmSchema.nodes.image) return false;
        void showImage({
          src: node.attrs.src as string,
          alt: (node.attrs.alt as string) ?? '',
        }).then((result) => {
          if (!result) return;
          v.dispatch(
            v.state.tr.setNodeMarkup(pos, undefined, {
              src: result.src,
              alt: result.alt,
            }),
          );
          v.focus();
        });
        return true;
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

  const handleLink = async () => {
    if (!view) return;
    const { from, to, empty } = view.state.selection;
    if (empty) {
      toast(s('editor.selectTextFirst'));
      return;
    }
    const linkMark = pmSchema.marks.link;
    let existingHref = '';
    view.state.doc.nodesBetween(from, to, (node) => {
      const mark = node.marks.find((m) => m.type === linkMark);
      if (mark) existingHref = mark.attrs.href as string;
    });
    const url = await showLink(existingHref);
    if (url === null) return;
    const tr = view.state.tr;
    if (url === '') {
      tr.removeMark(from, to, linkMark);
    } else {
      tr.addMark(from, to, linkMark.create({ href: url }));
    }
    view.dispatch(tr);
    view.focus();
  };

  const handleImage = async () => {
    if (!view) return;
    const result = await showImage();
    if (!result) return;
    const node = pmSchema.nodes.image.create({
      src: result.src,
      alt: result.alt,
    });
    view.dispatch(view.state.tr.replaceSelectionWith(node));
    view.focus();
  };

  const handleSplit = async () => {
    if (!view) return;
    const data = sheet();
    if (!data) return;

    const confirmed = await showConfirm(
      s('modal.split_title'),
      s('modal.split_confirm'),
    );
    if (!confirmed) return;

    const parentId = Object.entries(projectTree.nodes).find(([, n]) =>
      n.children?.includes(props.sheetId),
    )?.[0];
    if (!parentId) return;

    const anchor = view.state.selection.anchor;
    const doc = view.state.doc;
    const firstDoc = doc.cut(0, anchor);
    const secondDoc = doc.cut(anchor);

    const firstLabel = extractDocLabel(firstDoc) || data.node.label;
    const secondLabel = extractDocLabel(secondDoc) || data.node.label;

    const firstId = await createTreeNode('sheet', parentId, firstLabel);
    if (!firstId) return;
    await hardSave(firstId, firstDoc.toJSON(), { anchor: 0, head: 0 });

    const secondId = await createTreeNode('sheet', parentId, secondLabel);
    if (!secondId) return;
    await hardSave(secondId, secondDoc.toJSON(), { anchor: 0, head: 0 });

    navigate(`/nodes/${secondId}`);
    await deleteTreeNode(props.sheetId);
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
        onLink={handleLink}
        onImage={handleImage}
        onSplit={handleSplit}
      />

      <div ref={editorRef} class="prosemirror-editor typo" />

      <div class="editor-stats-overlay">
        <div class="flex items-center gap-12">
          <button
            class="editor-stats-btn"
            onClick={() => navigate(`/nodes/${props.sheetId}/analysis`)}
          >
            <span>
              {s('editor.size', { count: formatCompact(nodeSize()) })}
            </span>
          </button>
          <Show when={isDirty()}>
            <CircularProgress
              endTime={autosaveEndTime()}
              size={14}
              strokeWidth={0.4}
            />
          </Show>
          <Show when={!isDirty() && lastSaved()}>
            <TbOutlineCircleCheck size={14} />
          </Show>
        </div>
      </div>
    </div>
  );
};

export default Editor;

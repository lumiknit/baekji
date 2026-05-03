import { useNavigate } from '@solidjs/router';
import type { Component } from 'solid-js';
import {
  createEffect,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';
import { EditorView } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';
import toast from 'solid-toast';
import { ChangeSet } from '@codemirror/state';
import {
  getNode,
  putNode,
  createNodeAtomic,
  moveNodeAtomic,
} from '../../lib/doc/db';
import {
  loadMarkdownSheetState,
  saveMarkdownSheet,
  saveDeltaMarkdownSheet,
} from '../../lib/doc/db_helper';
import { s } from '../../lib/i18n';
import { logError } from '../../state/log';
import { getShortLabel } from '../../lib/markdown';
import {
  updateSheetMeta,
  findParentId,
  fetchProjectTree,
} from '../../state/project_tree';
import { activePjVerId } from '../../state/workspace';
import { settings } from '../../state/settings';
import { genUnorderedId } from '../../lib/uuid';
import type { SheetNode, SheetContent } from '../../lib/doc/v0';
import { buildExtensions, createEditorState } from './cm_setup';
import EditorToolOverlay from './EditorToolOverlay';
import BreadCrumb from '../BreadCrumb';

interface EditorProps {
  sheetId: string;
}

const Editor: Component<EditorProps> = (props) => {
  const navigate = useNavigate();
  let editorRef: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let saveInFlight = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  // Delta-save state
  let currentContentId: string | null = null;
  let nextDeltaSeq = 0;
  let pendingChanges: ChangeSet | null = null;
  let deltasSinceSnapshot = 0;
  let knownLabel: string | null = null; // tracks last written label to avoid stale-node reads
  const DELTA_THRESHOLD = 20;

  const [sheet] = createResource(
    () => props.sheetId,
    async (id) => {
      const node = await getNode(id);
      if (!node || node.type !== 'sheet') return undefined;
      const state = await loadMarkdownSheetState(id);
      return { node, ...state };
    },
  );

  const [isDirty, setIsDirty] = createSignal(false);
  const [charCount, setCharCount] = createSignal(0);
  const [autosaveEndTime, setAutosaveEndTime] = createSignal<Date | null>(null);

  /** Full snapshot save — always writes the complete markdown to DB. */
  const save = async (notify = false) => {
    if (!view || saveInFlight) return;
    const data = sheet();
    if (!data) return;

    clearTimeout(saveTimer);
    saveTimer = undefined;

    const markdown = view.state.doc.toString();
    const { anchor, head } = view.state.selection.main;

    saveInFlight = true;
    setAutosaveEndTime(null);
    pendingChanges = null;
    try {
      const { contentId, label } = await saveMarkdownSheet(
        data.node.id,
        markdown,
        { anchor, head },
      );
      currentContentId = contentId;
      nextDeltaSeq = 0;
      deltasSinceSnapshot = 0;

      if (label !== knownLabel) {
        const now = new Date().toISOString();
        await putNode({ ...data.node, label, updatedAt: now });
        updateSheetMeta(data.node.id, label, markdown.slice(0, 200));
        knownLabel = label;
      }
      setIsDirty(false);
      if (notify) toast.success(s('editor.saved'));
    } catch (err) {
      logError('Editor:save', err);
      toast.error(s('editor.saveFailed'));
    } finally {
      saveInFlight = false;
    }
  };

  /** Soft delta save — appends a composed ChangeSet to the current snapshot. */
  const softSave = async () => {
    if (!view || !pendingChanges || saveInFlight) return;
    if (!currentContentId || deltasSinceSnapshot >= DELTA_THRESHOLD) {
      await save();
      return;
    }

    const changesToSave = pendingChanges;
    pendingChanges = null;
    const { anchor, head } = view.state.selection.main;
    const seq = nextDeltaSeq;

    try {
      await saveDeltaMarkdownSheet(
        currentContentId,
        seq,
        changesToSave.toJSON(),
        { anchor, head },
      );
      nextDeltaSeq++;
      deltasSinceSnapshot++;
      setIsDirty(false);
    } catch (err) {
      pendingChanges = changesToSave; // restore on failure
      logError('Editor:softSave:delta', err);
      toast.error(s('editor.saveFailed'));
      return;
    }

    // Label update is best-effort: delta is already persisted, so a putNode
    // failure here doesn't corrupt data.
    try {
      const data = sheet();
      if (data) {
        const markdown = view.state.doc.toString();
        const label = getShortLabel(markdown);
        if (label !== knownLabel) {
          const now = new Date().toISOString();
          await putNode({ ...data.node, label, updatedAt: now });
          updateSheetMeta(data.node.id, label, markdown.slice(0, 200));
          knownLabel = label;
        }
      }
    } catch (err) {
      logError('Editor:softSave:label', err);
    }
  };

  const triggerAutosave = () => {
    clearTimeout(saveTimer);
    setAutosaveEndTime(new Date(Date.now() + settings.autosaveInterval * 1000));
    saveTimer = setTimeout(softSave, settings.autosaveInterval * 1000);
  };

  const extensions = buildExtensions({
    placeholderText: s('editor.placeholder'),
    onChange: (changes) => {
      pendingChanges = pendingChanges
        ? pendingChanges.compose(changes)
        : changes;
      setIsDirty(true);
      setCharCount(view?.state.doc.length ?? 0);
      triggerAutosave();
    },
    onSave: () => void save(true),
    getTypewriterMode: () => settings.typewriterMode,
  });

  const applySheetToView = (data: NonNullable<ReturnType<typeof sheet>>) => {
    if (!view) return;
    clearTimeout(saveTimer);
    saveTimer = undefined;
    saveInFlight = false;

    const state = createEditorState(data.markdown, data.selection, extensions);
    view.setState(state);
    view.focus();

    currentContentId = data.contentId;
    nextDeltaSeq = data.nextDeltaSeq;
    deltasSinceSnapshot = data.nextDeltaSeq;
    pendingChanges = null;
    knownLabel = data.node.label;

    setCharCount(data.markdown.length);
    setIsDirty(false);
    setAutosaveEndTime(null);
  };

  onMount(() => {
    if (!editorRef) return;

    view = new EditorView({ parent: editorRef });

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty()) e.preventDefault();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd+S is already handled inside CM6 keymap, but this catches
      // the case where the editor is not focused.
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.defaultPrevented) {
        e.preventDefault();
        void save(true);
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

  onCleanup(() => {
    clearTimeout(saveTimer);
    if (isDirty() || pendingChanges !== null) void save();
    view?.destroy();
  });

  const doUndo = () => {
    if (view) {
      undo(view);
      view.focus();
    }
  };

  const doRedo = () => {
    if (view) {
      redo(view);
      view.focus();
    }
  };

  const doSplit = async () => {
    if (!view || saveInFlight) return;
    const data = sheet();
    if (!data) return;

    const parentId = findParentId(data.node.id);
    const vid = activePjVerId();
    if (!parentId || !vid) {
      toast.error(s('editor.saveFailed'));
      return;
    }

    const cursorPos = view.state.selection.main.from;
    const doc = view.state.doc;
    const cursorLine = doc.lineAt(cursorPos);

    const topMarkdown = doc.sliceString(0, cursorLine.from).replace(/\n+$/, '');
    const bottomMarkdown = doc.sliceString(cursorLine.from);
    const now = new Date().toISOString();

    try {
      // 1. Create new sibling sheet with bottom content first (original is untouched)
      const newId = genUnorderedId();
      const newNode: SheetNode = {
        id: newId,
        pjVerId: vid,
        parentId,
        label: getShortLabel(bottomMarkdown),
        updatedAt: now,
        type: 'sheet',
        visual: { colorH: 0, colorS: 0 },
        tags: [],
        orderKey: 0,
      };
      const newContent: SheetContent = {
        id: genUnorderedId(),
        nodeId: newId,
        markdown: bottomMarkdown,
        selection: { anchor: 0, head: 0 },
      };
      await createNodeAtomic(newNode, newContent);

      // 2. Save current (top) content
      const { contentId, label } = await saveMarkdownSheet(
        data.node.id,
        topMarkdown,
        { anchor: 0, head: 0 },
      );
      currentContentId = contentId;
      nextDeltaSeq = 0;
      deltasSinceSnapshot = 0;
      pendingChanges = null;
      setIsDirty(false);

      if (label !== data.node.label) {
        await putNode({ ...data.node, label, updatedAt: now });
        updateSheetMeta(data.node.id, label, topMarkdown.slice(0, 200));
      }

      // 3. Move new sheet to position after current
      await moveNodeAtomic(newId, parentId, data.node.id);
      await fetchProjectTree(vid);

      navigate(`/nodes/${newId}`);
    } catch (err) {
      logError('Editor:doSplit', err);
      toast.error(s('editor.saveFailed'));
    }
  };

  const scrollToEdge = (edge: 'start' | 'end') => {
    if (!view) return;
    const pos = edge === 'start' ? 0 : view.state.doc.length;
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
  };

  return (
    <div class="editor-container">
      <div
        class="editor-section-marker editor-section-marker--start"
        onClick={() => scrollToEdge('start')}
      >
        <BreadCrumb nodeId={props.sheetId} />
      </div>

      <div ref={editorRef} class="cm-editor-wrap typo" />

      <div
        class="editor-section-marker editor-section-marker--end"
        onClick={() => scrollToEdge('end')}
      >
        <span class="editor-section-label">EOD</span>
        <hr class="separator-line flex-1" />
      </div>

      <EditorToolOverlay
        charCount={charCount}
        isDirty={isDirty}
        autosaveEndTime={autosaveEndTime}
        onUndo={doUndo}
        onRedo={doRedo}
        onSave={() => void save(true)}
        onSplit={() => void doSplit()}
        onAnalysis={() => navigate(`/nodes/${props.sheetId}/analysis`)}
      />
    </div>
  );
};

export default Editor;

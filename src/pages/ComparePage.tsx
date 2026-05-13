import type { Component } from 'solid-js';
import { createSignal, createResource, Index, Show } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { diffLines } from 'diff';
import type { Change } from 'diff';
import { TbOutlineArrowLeft, TbOutlineCheck } from 'solid-icons/tb';
import { withSheetDoc } from '../lib/doc/docCache';
import { softDeleteSheet } from '../state/sheet_list';
import { s } from '../lib/i18n';

// null = unresolved, true = keep, false = discard
type Decision = boolean | null;

function stripMarkdownFirst(text: string): string {
  const first = text.split('\n').find((l) => l.trim());
  return (first ?? '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/[*_~`]/g, '')
    .trim();
}

async function loadContent(id: string): Promise<string> {
  return withSheetDoc(id, async (sd) => sd.content.toString());
}

async function writeContent(id: string, content: string): Promise<void> {
  await withSheetDoc(id, async (sd) => {
    sd.doc.transact(() => {
      sd.content.delete(0, sd.content.length);
      sd.content.insert(0, content);
    });
  });
}

const ComparePage: Component = () => {
  const params = useParams<{ idA: string; idB: string }>();
  const navigate = useNavigate();

  const [contents] = createResource(
    () => [params.idA, params.idB] as const,
    async ([idA, idB]) => {
      const [a, b] = await Promise.all([loadContent(idA), loadContent(idB)]);
      return { a, b };
    },
  );

  // decisions[i]: for diff chunks that are added or removed, user picks keep/discard
  const [decisions, setDecisions] = createSignal<Decision[]>([]);

  const chunks = (): Change[] => {
    const c = contents();
    if (!c) return [];
    return diffLines(c.a, c.b);
  };

  const initDecisions = (cs: Change[]) => {
    setDecisions(cs.map((ch) => (ch.added || ch.removed ? null : true)));
  };

  let initialized = false;
  const getDecisions = (): Decision[] => {
    const cs = chunks();
    if (!initialized && cs.length > 0) {
      initialized = true;
      initDecisions(cs);
    }
    return decisions();
  };

  const allResolved = () => getDecisions().every((d) => d !== null);

  const buildResult = () => {
    const cs = chunks();
    const ds = getDecisions();
    return cs
      .filter((_ch, i) => ds[i] === true)
      .map((ch) => ch.value)
      .join('');
  };

  const handleMerge = async () => {
    if (!allResolved()) return;
    await writeContent(params.idA, buildResult());
    softDeleteSheet(params.idB);
    navigate(-1);
  };

  const labelA = () => {
    const c = contents();
    return c ? stripMarkdownFirst(c.a) || params.idA : params.idA;
  };
  const labelB = () => {
    const c = contents();
    return c ? stripMarkdownFirst(c.b) || params.idB : params.idB;
  };

  return (
    <div class="page-body compare-page">
      <div class="compare-header">
        <button class="btn-border btn-sm" onClick={() => navigate(-1)}>
          <TbOutlineArrowLeft />
        </button>
        <span class="compare-title">
          {labelA()} vs {labelB()}
        </span>
        <button
          class="btn-border btn-sm"
          disabled={!allResolved()}
          onClick={handleMerge}
        >
          <TbOutlineCheck />
          {s('compare.finish')}
        </button>
      </div>

      <Show when={contents.loading}>
        <p class="compare-loading">{s('common.loading')}</p>
      </Show>

      <Show when={contents()}>
        <div class="compare-list">
          <Index each={chunks()}>
            {(chunk, i) => {
              const ds = getDecisions();
              const dec = () => ds[i] ?? null;
              const isDiff = () => chunk().added || chunk().removed;

              return (
                <div
                  class="compare-chunk"
                  classList={{
                    'compare-chunk--added': !!chunk().added,
                    'compare-chunk--removed': !!chunk().removed,
                    'compare-chunk--kept': isDiff() && dec() === true,
                    'compare-chunk--discarded': isDiff() && dec() === false,
                  }}
                >
                  <pre class="compare-chunk-text">{chunk().value}</pre>
                  <Show when={isDiff()}>
                    <div class="compare-chunk-btns">
                      <button
                        class="btn-border btn-sm"
                        classList={{ 'btn-active': dec() === true }}
                        onClick={() =>
                          setDecisions((prev) => {
                            const next = [...prev];
                            next[i] = true;
                            return next;
                          })
                        }
                      >
                        {chunk().removed
                          ? s('compare.pick_a')
                          : s('compare.pick_b')}
                      </button>
                      <button
                        class="btn-border btn-sm"
                        classList={{ 'btn-active': dec() === false }}
                        onClick={() =>
                          setDecisions((prev) => {
                            const next = [...prev];
                            next[i] = false;
                            return next;
                          })
                        }
                      >
                        {s('compare.skip')}
                      </button>
                    </div>
                  </Show>
                </div>
              );
            }}
          </Index>
        </div>
      </Show>
    </div>
  );
};

export default ComparePage;

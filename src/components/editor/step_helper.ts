import { Step } from 'prosemirror-transform';

type StepJSON = {
  stepType: string;
  from: number;
  to: number;
  slice?: {
    content: unknown;
  };
};

type SimpleReplaceStepJSON = {
  stepType: 'replace';
  from: number;
  to: number;
  slice: {
    content: [
      {
        type: 'text';
        text: string;
      },
    ];
  };
};

function isSimpleReplaceStep(s: StepJSON): s is SimpleReplaceStepJSON {
  return (
    s.stepType === 'replace' &&
    s.slice &&
    typeof s.slice === 'object' &&
    Array.isArray(s.slice.content) &&
    s.slice.content.length === 1 &&
    s.slice.content[0] &&
    s.slice.content[0].type === 'text' &&
    typeof s.slice.content[0].text === 'string'
  );
}

function complexMergeSteps(steps: Step[]): StepJSON[] {
  if (steps.length === 0) return [];
  const result: StepJSON[] = [];

  // Two cursor: raw one and json one.

  let jCur: null | StepJSON = null;
  const pushJSON = (s: StepJSON) => {
    if (jCur === null) {
      jCur = s;
      return;
    }

    if (isSimpleReplaceStep(jCur) && isSimpleReplaceStep(s)) {
      const lastFrom = jCur.from;
      const lastLen = jCur.slice.content[0].text.length;
      if (lastFrom <= s.from && lastFrom + lastLen === s.to) {
        //console.log('Opt', jCur, s);
        jCur.slice.content[0].text =
          jCur.slice.content[0].text.slice(0, s.from - lastFrom) +
          s.slice.content[0].text;
        return;
      }
    }
    result.push(jCur);
    jCur = s;
  };

  let rCur = steps[0];
  const pushStep = (s: Step) => {
    const merged = rCur.merge(s);
    if (merged) {
      rCur = merged;
    } else {
      pushJSON(rCur.toJSON() as StepJSON);
      rCur = s;
    }
  };

  for (let i = 1; i < steps.length; i++) {
    pushStep(steps[i]);
  }
  pushJSON(rCur.toJSON() as StepJSON);
  result.push(jCur!);

  return result;
}

export function buildOptimizedStepJSONs(steps: Step[]): StepJSON[] {
  return complexMergeSteps(steps);
}

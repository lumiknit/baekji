/** Trim first spaces. This can be used with backtick. */
export const dedent = (
  strings: TemplateStringsArray,
  ...values: any[]
): string => {
  let raw = strings.reduce((acc, str, i) => {
    return acc + str + (values[i] ?? '');
  }, '');

  const lines = raw.split('\n');

  if (lines[0].trim() === '') lines.shift();
  if (lines[lines.length - 1].trim() === '') lines.pop();

  const indent = Math.min(
    ...lines
      .filter((line) => line.trim())
      .map((line) => line.match(/^(\s*)/)![1].length),
  );

  return lines.map((line) => line.slice(indent)).join('\n');
};

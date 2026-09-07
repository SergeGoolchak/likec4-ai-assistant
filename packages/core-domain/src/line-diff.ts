export interface DiffLine {
  kind: 'context' | 'added' | 'removed';
  /** Original line, including its line ending when present. */
  text: string;
  beforeLine?: number;
  afterLine?: number;
}

/** Bounded LCS: large changed regions fall back to a lossless replacement. */
export function compareLines(before: string, after: string): { lines: DiffLine[]; simplified: boolean } {
  const a = before.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const b = after.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const x = a.slice(prefix, a.length - suffix);
  const y = b.slice(prefix, b.length - suffix);
  const lines: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  const emit = (kind: DiffLine['kind'], text: string) => {
    lines.push({ kind, text, beforeLine: kind === 'added' ? undefined : oldLine++, afterLine: kind === 'removed' ? undefined : newLine++ });
  };
  for (let i = 0; i < prefix; i++) emit('context', a[i]!);
  const simplified = (x.length + 1) * (y.length + 1) > 1_000_000;
  if (simplified) {
    x.forEach((line) => emit('removed', line));
    y.forEach((line) => emit('added', line));
  } else {
    const width = y.length + 1;
    const table = new Uint32Array((x.length + 1) * width);
    for (let i = x.length - 1; i >= 0; i--) {
      for (let j = y.length - 1; j >= 0; j--) {
        table[i * width + j] = x[i] === y[j]
          ? 1 + table[(i + 1) * width + j + 1]!
          : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) { emit('context', x[i++]!); j++; }
      else if (i < x.length && (j === y.length || table[(i + 1) * width + j]! >= table[i * width + j + 1]!)) emit('removed', x[i++]!);
      else emit('added', y[j++]!);
    }
  }
  for (let i = a.length - suffix; i < a.length; i++) emit('context', a[i]!);
  return { lines, simplified };
}

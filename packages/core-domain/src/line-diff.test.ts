import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareLines } from './line-diff.js';

test('line diff identifies a replacement with correct old/new line numbers', () => {
  const { lines } = compareLines('a\nb\nc\n', 'a\nx\nc\n');
  assert.deepEqual(lines.map((l) => [l.kind, l.beforeLine, l.afterLine]), [
    ['context', 1, 1], ['removed', 2, undefined], ['added', undefined, 2], ['context', 3, 3],
  ]);
});

test('diff reconstructs both inputs including blank lines, duplicate lines, CRLF and missing final newline', () => {
  for (const [before, after] of [['', 'a\n'], ['a\n', ''], ['a\na\nb\n', 'a\nb\na\n'], ['a\r\n\r\nb', 'a\n\nb\n'], ['', ''], ['same', 'same']]) {
    const { lines } = compareLines(before!, after!);
    assert.equal(lines.filter((l) => l.kind !== 'added').map((l) => l.text).join(''), before);
    assert.equal(lines.filter((l) => l.kind !== 'removed').map((l) => l.text).join(''), after);
  }
});

test('large unrelated regions use a bounded, lossless replacement', () => {
  const before = 'old\n'.repeat(1100);
  const after = 'new\n'.repeat(1100);
  const diff = compareLines(before, after);
  assert.equal(diff.simplified, true);
  assert.equal(diff.lines.filter((l) => l.kind === 'removed').map((l) => l.text).join(''), before);
  assert.equal(diff.lines.filter((l) => l.kind === 'added').map((l) => l.text).join(''), after);
});

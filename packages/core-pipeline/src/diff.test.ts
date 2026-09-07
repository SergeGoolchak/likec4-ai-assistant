import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RepositoryFile } from '@likec4-ai/core-domain';
import { computeFileDiff } from './diff.js';

test('a path only present in generatedFiles is reported as added', () => {
  const existing: RepositoryFile[] = [];
  const generated: RepositoryFile[] = [{ path: 'generated/new.c4', content: 'service a "A"' }];

  const diff = computeFileDiff(existing, generated);

  assert.deepEqual(diff, [{ path: 'generated/new.c4', changeType: 'added', after: 'service a "A"' }]);
});

test('a path present in both with different content is reported as modified', () => {
  const existing: RepositoryFile[] = [{ path: 'model.c4', content: 'before' }];
  const generated: RepositoryFile[] = [{ path: 'model.c4', content: 'after' }];

  const diff = computeFileDiff(existing, generated);

  assert.deepEqual(diff, [{ path: 'model.c4', changeType: 'modified', before: 'before', after: 'after' }]);
});

test('a path present in both with identical content produces no diff entry', () => {
  const existing: RepositoryFile[] = [{ path: 'model.c4', content: 'unchanged' }];
  const generated: RepositoryFile[] = [{ path: 'model.c4', content: 'unchanged' }];

  assert.deepEqual(computeFileDiff(existing, generated), []);
});

test('a path only present in existingFiles is reported as deleted', () => {
  const existing: RepositoryFile[] = [{ path: 'model.c4', content: 'gone' }];
  const generated: RepositoryFile[] = [];

  const diff = computeFileDiff(existing, generated);

  assert.deepEqual(diff, [{ path: 'model.c4', changeType: 'deleted', before: 'gone' }]);
});

test('multiple files are diffed independently in one pass', () => {
  const existing: RepositoryFile[] = [
    { path: 'a.c4', content: 'a' },
    { path: 'b.c4', content: 'b' },
  ];
  const generated: RepositoryFile[] = [
    { path: 'a.c4', content: 'a' },
    { path: 'b.c4', content: 'b-changed' },
    { path: 'c.c4', content: 'c' },
  ];

  const diff = computeFileDiff(existing, generated);

  assert.equal(diff.length, 2);
  assert.ok(diff.some((d) => d.path === 'b.c4' && d.changeType === 'modified'));
  assert.ok(diff.some((d) => d.path === 'c.c4' && d.changeType === 'added'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ArchitectureElement, ArchitectureGraph, ProposalItem, RepositoryFile } from '@likec4-ai/core-domain';
import { assembleGeneratedFiles } from './likec4-file-assembler.js';

function element(overrides: Partial<ArchitectureElement> & Pick<ArchitectureElement, 'id' | 'kind' | 'title'>): ArchitectureElement {
  return { tags: [], metadata: {}, sourceRef: { file: 'model.c4', startLine: 1, endLine: 1 }, ...overrides };
}

function graphOf(elements: ArchitectureElement[]): ArchitectureGraph {
  return {
    elements: new Map(elements.map((e) => [e.id, e])),
    relationships: new Map(),
    views: new Map(),
    byKind: new Map(),
    byTag: new Map(),
    neighborsIndex: new Map(),
    sourceFileOf: new Map(elements.map((e) => [e.id, e.sourceRef.file])),
  };
}

function item(overrides: Partial<ProposalItem> & Pick<ProposalItem, 'id'>): ProposalItem {
  return {
    type: 'new-element',
    title: 'Item',
    explanation: { what: 'w', why: 'y', impact: 'i', confidence: 0.8, assumptions: [] },
    sources: [],
    decision: 'approved',
    ...overrides,
  };
}

test('a new-element item (no targetElementId) is written to its own new file', () => {
  const existing: RepositoryFile[] = [{ path: 'model.c4', content: 'model {\n}\n' }];
  const i = item({ id: 'i1', title: 'Refund Service', proposedLikeC4Code: 'service refundService "Refund Service" {}' });

  const { files, itemsByFile } = assembleGeneratedFiles(existing, [i], graphOf([]));

  const modelFile = files.find((f) => f.path === 'model.c4');
  const newFile = files.find((f) => f.path === 'generated/refund-service.c4');
  assert.equal(modelFile?.content, 'model {\n}\n', 'the untouched file must survive verbatim');
  assert.equal(newFile?.content, 'service refundService "Refund Service" {}');
  assert.deepEqual(itemsByFile.get('generated/refund-service.c4'), ['i1']);
});

test('a modified-element item replaces exactly its sourceRef line range, leaving the rest of the file untouched', () => {
  const el = element({ id: 'orderService', kind: 'service', title: 'Order Service', sourceRef: { file: 'model.c4', startLine: 3, endLine: 5 } });
  const existing: RepositoryFile[] = [
    {
      path: 'model.c4',
      content: ['model {', '  system paymentsPlatform {', '    service orderService "Order Service" {', '      description "old"', '    }', '  }', '}'].join(
        '\n',
      ),
    },
  ];
  const i = item({
    id: 'i1',
    type: 'modified-element',
    targetElementId: 'orderService',
    proposedLikeC4Code: '    service orderService "Order Service" {\n      description "new"\n    }',
  });

  const { files, itemsByFile } = assembleGeneratedFiles(existing, [i], graphOf([el]));
  const result = files.find((f) => f.path === 'model.c4')?.content ?? '';

  assert.equal(
    result,
    ['model {', '  system paymentsPlatform {', '    service orderService "Order Service" {', '      description "new"', '    }', '  }', '}'].join('\n'),
  );
  assert.deepEqual(itemsByFile.get('model.c4'), ['i1']);
});

test('rejected items are not applied at all', () => {
  const existing: RepositoryFile[] = [{ path: 'model.c4', content: 'model {}\n' }];
  const i = item({ id: 'i1', decision: 'rejected', proposedLikeC4Code: 'service shouldNotAppear {}' });

  const { files, itemsByFile } = assembleGeneratedFiles(existing, [i], graphOf([]));

  assert.equal(files.length, 1);
  assert.equal(files[0]?.content, 'model {}\n');
  assert.equal(itemsByFile.size, 0);
});

test('an edited item uses its human-written proposedLikeC4Code just like an approved one', () => {
  const existing: RepositoryFile[] = [];
  const i = item({ id: 'i1', decision: 'edited', title: 'Refund Service', proposedLikeC4Code: 'service refundService "Hand-edited" {}' });

  const { files } = assembleGeneratedFiles(existing, [i], graphOf([]));

  assert.equal(files[0]?.content, 'service refundService "Hand-edited" {}');
});

test('two new-element items with colliding slugs get distinct file paths', () => {
  const i1 = item({ id: 'i1-aaaaaaaa-bbbb', title: 'Refund Service', proposedLikeC4Code: 'A' });
  const i2 = item({ id: 'i2-cccccccc-dddd', title: 'Refund Service', proposedLikeC4Code: 'B' });

  const { files } = assembleGeneratedFiles([], [i1, i2], graphOf([]));

  const paths = files.map((f) => f.path);
  assert.equal(new Set(paths).size, 2, 'paths must not collide');
  assert.ok(paths.includes('generated/refund-service.c4'));
});

test('a modified-element item whose target has no known sourceRef file falls back to a new file rather than being dropped silently', () => {
  const el = element({ id: 'orphan', kind: 'service', title: 'Orphan' });
  // sourceRef points at a file that is NOT in existingFiles (defensive edge case).
  const i = item({ id: 'i1', type: 'modified-element', targetElementId: 'orphan', title: 'Orphan Fix', proposedLikeC4Code: 'fixed' });

  const { files } = assembleGeneratedFiles([], [i], graphOf([el]));

  assert.equal(files.length, 1);
  assert.equal(files[0]?.content, 'fixed');
});

test('two modifications to the same file at different line ranges both apply correctly regardless of order', () => {
  const elA = element({ id: 'a', kind: 'service', title: 'A', sourceRef: { file: 'model.c4', startLine: 2, endLine: 2 } });
  const elB = element({ id: 'b', kind: 'service', title: 'B', sourceRef: { file: 'model.c4', startLine: 3, endLine: 3 } });
  const existing: RepositoryFile[] = [{ path: 'model.c4', content: ['model {', '  service a "A old"', '  service b "B old"', '  service c "C old"', '}'].join('\n') }];
  const items = [
    item({ id: 'i1', type: 'modified-element', targetElementId: 'a', proposedLikeC4Code: '  service a "A new"' }),
    item({ id: 'i2', type: 'modified-element', targetElementId: 'b', proposedLikeC4Code: '  service b "B new"' }),
  ];

  const { files } = assembleGeneratedFiles(existing, items, graphOf([elA, elB]));
  const result = files[0]?.content ?? '';

  assert.equal(result, ['model {', '  service a "A new"', '  service b "B new"', '  service c "C old"', '}'].join('\n'));
});

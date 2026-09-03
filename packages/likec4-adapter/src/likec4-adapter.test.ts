import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RepositoryFile } from '@likec4-ai/core-domain';
import { LikeC4NpmParser } from './likec4-parser.js';
import { LikeC4NpmValidator } from './likec4-validator.js';

const VALID_MODEL: RepositoryFile[] = [
  {
    path: 'model.c4',
    content: `specification {
  element service
  element database
}

model {
  service orderService "Order Service" {
    description "Handles orders"
  }
  database orderDb "Order DB"

  orderService -> orderDb "reads/writes"
}

views {
  view index {
    include *
  }
}
`,
  },
];

const INVALID_MODEL: RepositoryFile[] = [
  {
    path: 'model.c4',
    content: `specification {
  element service
}

model {
  service orderService "Order Service" {
  service brokenNested "oops"
}
`,
  },
];

test('parseProject builds elements, relationships and views with source locations', async () => {
  const parser = new LikeC4NpmParser();
  const result = await parser.parseProject(VALID_MODEL);

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.graph.elements.size, 2);
  assert.equal(result.graph.relationships.size, 1);
  assert.equal(result.graph.views.size, 1);

  const orderService = result.graph.elements.get('orderService');
  assert.ok(orderService);
  assert.equal(orderService.kind, 'service');
  assert.equal(orderService.title, 'Order Service');
  assert.equal(orderService.description, 'Handles orders');
  assert.equal(orderService.sourceRef.file, 'model.c4');
  assert.ok(orderService.sourceRef.startLine > 0);

  const relationship = [...result.graph.relationships.values()][0];
  assert.ok(relationship);
  assert.equal(relationship.sourceId, 'orderService');
  assert.equal(relationship.targetId, 'orderDb');

  const view = result.graph.views.get('index');
  assert.ok(view);
  assert.equal(view.kind, 'element');
  assert.deepEqual([...view.includedElementIds].sort(), ['orderDb', 'orderService']);

  const neighbors = result.graph.neighborsIndex.get('orderService');
  assert.deepEqual(neighbors?.outgoing, [relationship.id]);
});

test('parseProject still returns a best-effort graph alongside diagnostics for invalid syntax', async () => {
  const parser = new LikeC4NpmParser();
  const result = await parser.parseProject(INVALID_MODEL);

  assert.ok(result.diagnostics.length > 0);
  assert.equal(result.diagnostics[0]?.severity, 'error');
  assert.equal(result.diagnostics[0]?.file, 'model.c4');
});

test('validateTechnical reports ok:true for a valid model and ok:false for an invalid one', async () => {
  const validator = new LikeC4NpmValidator();

  const okResult = await validator.validateTechnical(VALID_MODEL);
  assert.equal(okResult.ok, true);

  const badResult = await validator.validateTechnical(INVALID_MODEL);
  assert.equal(badResult.ok, false);
  assert.ok(badResult.diagnostics.length > 0);
});

test('renderViewsPreview returns real SVG for the requested view', async () => {
  const validator = new LikeC4NpmValidator();
  const views = await validator.renderViewsPreview(VALID_MODEL, ['index']);

  assert.equal(views.length, 1);
  assert.equal(views[0]?.viewId, 'index');
  assert.match(views[0]?.svg ?? '', /^<\?xml/);
  assert.match(views[0]?.svg ?? '', /<svg/);
});

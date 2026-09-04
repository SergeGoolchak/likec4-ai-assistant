import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapAwareReplacer, mapAwareReviver } from './map-json.js';

test('round-trips a Map nested inside a plain object', () => {
  const original = {
    label: 'graph',
    elements: new Map([
      ['a', { title: 'A' }],
      ['b', { title: 'B' }],
    ]),
  };

  const json = JSON.stringify(original, mapAwareReplacer);
  const restored = JSON.parse(json, mapAwareReviver) as typeof original;

  assert.ok(restored.elements instanceof Map);
  assert.deepEqual([...restored.elements.entries()], [...original.elements.entries()]);
  assert.equal(restored.label, 'graph');
});

test('round-trips an empty Map', () => {
  const json = JSON.stringify({ m: new Map() }, mapAwareReplacer);
  const restored = JSON.parse(json, mapAwareReviver) as { m: Map<unknown, unknown> };
  assert.ok(restored.m instanceof Map);
  assert.equal(restored.m.size, 0);
});

test('round-trips multiple Maps at different nesting levels', () => {
  const original = {
    top: new Map([['x', 1]]),
    nested: { deep: new Map([['y', 2]]) },
  };

  const restored = JSON.parse(JSON.stringify(original, mapAwareReplacer), mapAwareReviver) as typeof original;

  assert.ok(restored.top instanceof Map);
  assert.ok(restored.nested.deep instanceof Map);
  assert.equal(restored.top.get('x'), 1);
  assert.equal(restored.nested.deep.get('y'), 2);
});

test('leaves plain objects and arrays untouched', () => {
  const original = { a: 1, b: [1, 2, 3], c: { d: 'text' } };
  const restored = JSON.parse(JSON.stringify(original, mapAwareReplacer), mapAwareReviver);
  assert.deepEqual(restored, original);
});

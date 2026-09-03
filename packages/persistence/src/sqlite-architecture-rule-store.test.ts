import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ArchitectureRule } from '@likec4-ai/core-domain';
import { openDatabase } from './database.js';
import { SqliteArchitectureRuleStore } from './sqlite-architecture-rule-store.js';

async function withStore(fn: (store: SqliteArchitectureRuleStore) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'likec4-ai-rule-store-'));
  try {
    const db = await openDatabase(join(dir, 'app.db'));
    await fn(new SqliteArchitectureRuleStore(db));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const REST_API_RULE: ArchitectureRule = {
  id: 'r1',
  appliesToKinds: ['rest-api'],
  title: 'REST API naming',
  description: 'REST API operations must be named verb-first, e.g. getOrder, createOrder.',
  requiredMetadata: ['owner'],
  namingConventionPattern: '^(get|create|update|delete)[A-Z].*',
  examples: ['getOrder', 'createOrder'],
  severity: 'must',
};

test('creates and lists rules scoped to a project', async () => {
  await withStore(async (store) => {
    await store.create('p1', REST_API_RULE);
    await store.create('p2', { ...REST_API_RULE, id: 'r2' });

    const p1Rules = await store.list('p1');
    assert.equal(p1Rules.length, 1);
    assert.deepEqual(p1Rules[0], REST_API_RULE);
  });
});

test('update merges a patch without requiring the full rule', async () => {
  await withStore(async (store) => {
    await store.create('p1', REST_API_RULE);
    await store.update('p1', 'r1', { severity: 'should' });

    const [rule] = await store.list('p1');
    assert.equal(rule?.severity, 'should');
    assert.equal(rule?.title, REST_API_RULE.title);
  });
});

test('delete removes a rule scoped to its project', async () => {
  await withStore(async (store) => {
    await store.create('p1', REST_API_RULE);
    await store.delete('p1', 'r1');
    assert.deepEqual(await store.list('p1'), []);
  });
});

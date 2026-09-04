import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfluenceServerAdapter } from './confluence-server-adapter.js';

function fakeFetch(handler: (url: string, init: RequestInit) => Response): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => handler(String(url), init ?? {})) as typeof fetch;
}

const SAMPLE_RESPONSE = {
  id: '12345',
  title: 'Payment API Spec',
  space: { key: 'ENG' },
  version: { number: 7 },
  body: { storage: { value: '<h1>Overview</h1><p>Handles payments.</p>' } },
  _links: { base: 'https://confluence.example.com', webui: '/spaces/ENG/pages/12345/Payment+API+Spec' },
};

test('fetchPage sends the PAT only as a Bearer header and parses the response into ConfluencePageContent', async () => {
  let capturedAuth: string | undefined;
  let capturedUrl = '';

  const adapter = new ConfluenceServerAdapter({
    baseUrl: 'https://confluence.example.com',
    token: 'secret-pat',
    fetchImpl: fakeFetch((url, init) => {
      capturedUrl = url;
      capturedAuth = (init.headers as Record<string, string>).Authorization;
      return new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 });
    }),
  });

  const page = await adapter.fetchPage({ baseUrl: 'https://confluence.example.com', pageId: '12345' });

  assert.equal(capturedAuth, 'Bearer secret-pat');
  assert.match(capturedUrl, /\/rest\/api\/content\/12345\?expand=body\.storage,space,version/);
  assert.deepEqual(page, {
    pageId: '12345',
    title: 'Payment API Spec',
    version: 7,
    spaceKey: 'ENG',
    url: 'https://confluence.example.com/spaces/ENG/pages/12345/Payment+API+Spec',
    sections: [
      { id: 'overview-0', headingPath: ['Overview'], kind: 'paragraph', text: 'Handles payments.' },
    ],
    fetchedAt: page.fetchedAt,
  });
});

test('fetchPage throws when the server responds with an error status', async () => {
  const adapter = new ConfluenceServerAdapter({
    baseUrl: 'https://confluence.example.com',
    token: 'secret-pat',
    fetchImpl: fakeFetch(() => new Response('not found', { status: 404 })),
  });

  await assert.rejects(() => adapter.fetchPage({ baseUrl: 'https://confluence.example.com', pageId: 'missing' }), /404/);
});

test('testConnection succeeds on a 200 response', async () => {
  const adapter = new ConfluenceServerAdapter({
    baseUrl: 'https://confluence.example.com',
    token: 'secret-pat',
    fetchImpl: fakeFetch(() => new Response('{"results":[]}', { status: 200 })),
  });

  assert.deepEqual(await adapter.testConnection(), { ok: true });
});

test('testConnection reports an auth-specific error on 401/403', async () => {
  const adapter = new ConfluenceServerAdapter({
    baseUrl: 'https://confluence.example.com',
    token: 'bad-token',
    fetchImpl: fakeFetch(() => new Response('unauthorized', { status: 401 })),
  });

  const result = await adapter.testConnection();
  assert.equal(result.ok, false);
  assert.equal(result.error?.id, 'confluence.auth-error');
});

test('testConnection reports a network error without throwing when fetch rejects', async () => {
  const adapter = new ConfluenceServerAdapter({
    baseUrl: 'https://confluence.example.com',
    token: 'secret-pat',
    fetchImpl: (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch,
  });

  const result = await adapter.testConnection();
  assert.equal(result.ok, false);
  assert.equal(result.error?.id, 'confluence.network-error');
});

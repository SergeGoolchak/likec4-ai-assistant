import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testOpenAIConnection } from './test-openai-connection.js';

function fakeFetch(handler: (url: string, init: RequestInit) => Response): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => handler(String(url), init ?? {})) as typeof fetch;
}

test('reports ok on a 200 response and sends the key only as a header', async () => {
  let capturedAuth: string | undefined;
  const result = await testOpenAIConnection({
    apiKey: 'sk-secret',
    fetchImpl: fakeFetch((url, init) => {
      capturedAuth = (init.headers as Record<string, string>).Authorization;
      assert.equal(url, 'https://api.openai.com/v1/models');
      return new Response('{}', { status: 200 });
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(capturedAuth, 'Bearer sk-secret');
});

test('succeeds without an API key and without an Authorization header (e.g. a local server)', async () => {
  let sawHeaders: Record<string, string> | undefined;
  const result = await testOpenAIConnection({
    baseUrl: 'http://localhost:11434/v1',
    fetchImpl: fakeFetch((_url, init) => {
      sawHeaders = init.headers as Record<string, string>;
      return new Response('{}', { status: 200 });
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(sawHeaders?.Authorization, undefined);
});

test('reports an auth-specific error on 401', async () => {
  const result = await testOpenAIConnection({ apiKey: 'bad', fetchImpl: fakeFetch(() => new Response('', { status: 401 })) });
  assert.equal(result.ok, false);
  assert.equal(result.error?.id, 'openai.auth-error');
});

test('reports a network error without throwing when fetch rejects', async () => {
  const result = await testOpenAIConnection({
    apiKey: 'sk-secret',
    fetchImpl: (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error?.id, 'openai.network-error');
});

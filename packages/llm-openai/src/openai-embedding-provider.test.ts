import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIEmbeddingProvider } from './openai-embedding-provider.js';

function fakeFetch(handler: (url: string, init: RequestInit) => Response): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => handler(String(url), init ?? {})) as typeof fetch;
}

test('sends the API key only as a request header and parses embeddings back in order', async () => {
  let capturedAuth: string | undefined;
  let capturedBody: unknown;

  const provider = new OpenAIEmbeddingProvider({
    apiKey: 'sk-test-secret',
    fetchImpl: fakeFetch((url, init) => {
      capturedAuth = (init.headers as Record<string, string>).Authorization;
      capturedBody = JSON.parse(init.body as string);
      assert.equal(url, 'https://api.openai.com/v1/embeddings');
      return new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: [0, 1] },
            { index: 0, embedding: [1, 0] },
          ],
        }),
        { status: 200 },
      );
    }),
  });

  const result = await provider.embed(['first', 'second']);

  assert.equal(capturedAuth, 'Bearer sk-test-secret');
  assert.deepEqual(capturedBody, { model: 'text-embedding-3-small', input: ['first', 'second'] });
  // Reordered by `index` even though the fake API returned them out of order.
  assert.deepEqual(result, [
    [1, 0],
    [0, 1],
  ]);
});

test('throws a descriptive error without leaking the API key on a failed request', async () => {
  const provider = new OpenAIEmbeddingProvider({
    apiKey: 'sk-test-secret',
    fetchImpl: fakeFetch(() => new Response('rate limited', { status: 429 })),
  });

  await assert.rejects(
    () => provider.embed(['x']),
    (err: Error) => {
      assert.match(err.message, /429/);
      assert.match(err.message, /rate limited/);
      assert.equal(err.message.includes('sk-test-secret'), false);
      return true;
    },
  );
});

test('sends no Authorization header when no API key is configured (e.g. a local embedding server)', async () => {
  let sawHeaders: Record<string, string> | undefined;
  const provider = new OpenAIEmbeddingProvider({
    baseUrl: 'http://localhost:11434/v1',
    fetchImpl: fakeFetch((_url, init) => {
      sawHeaders = init.headers as Record<string, string>;
      return new Response(JSON.stringify({ data: [{ index: 0, embedding: [1] }] }), { status: 200 });
    }),
  });

  await provider.embed(['x']);

  assert.equal(sawHeaders?.Authorization, undefined);
});

test('returns an empty array without making a request for empty input', async () => {
  let called = false;
  const provider = new OpenAIEmbeddingProvider({
    apiKey: 'sk-test-secret',
    fetchImpl: fakeFetch(() => {
      called = true;
      return new Response('{}', { status: 200 });
    }),
  });

  assert.deepEqual(await provider.embed([]), []);
  assert.equal(called, false);
});

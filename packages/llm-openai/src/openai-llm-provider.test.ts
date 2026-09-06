import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAILLMProvider } from './openai-llm-provider.js';

function fakeFetch(handler: (url: string, init: RequestInit) => Response): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => handler(String(url), init ?? {})) as typeof fetch;
}

test('complete sends the API key only as a header and returns the message content', async () => {
  let capturedAuth: string | undefined;
  let capturedBody: unknown;

  const provider = new OpenAILLMProvider({
    apiKey: 'sk-test-secret',
    fetchImpl: fakeFetch((url, init) => {
      capturedAuth = (init.headers as Record<string, string>).Authorization;
      capturedBody = JSON.parse(init.body as string);
      assert.equal(url, 'https://api.openai.com/v1/chat/completions');
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'hello there' } }], usage: { prompt_tokens: 5, completion_tokens: 2 } }),
        { status: 200 },
      );
    }),
  });

  const result = await provider.complete([{ role: 'user', content: 'hi' }], { stage: 'extract-requirements' });

  assert.equal(capturedAuth, 'Bearer sk-test-secret');
  assert.deepEqual(capturedBody, { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(result.content, 'hello there');
  assert.deepEqual(result.usage, { promptTokens: 5, completionTokens: 2 });
});

test('completeJSON requests json_object mode and parses the returned JSON', async () => {
  const provider = new OpenAILLMProvider({
    apiKey: 'sk-test-secret',
    fetchImpl: fakeFetch((_url, init) => {
      const body = JSON.parse(init.body as string);
      assert.deepEqual(body.response_format, { type: 'json_object' });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"kind":"service","confidence":0.8}' } }] }), {
        status: 200,
      });
    }),
  });

  const result = await provider.completeJSON<{ kind: string; confidence: number }>([{ role: 'user', content: 'x' }], {
    stage: 'entity-matching',
  });

  assert.deepEqual(result.content, { kind: 'service', confidence: 0.8 });
});

test('completeJSON retries once with a JSON reminder and succeeds if the retry parses', async () => {
  let callCount = 0;
  const provider = new OpenAILLMProvider({
    apiKey: 'sk-test-secret',
    fetchImpl: fakeFetch((_url, init) => {
      callCount++;
      const body = JSON.parse(init.body as string) as { messages: Array<{ content: string }> };
      if (callCount === 1) {
        return new Response(JSON.stringify({ choices: [{ message: { content: 'not json at all' } }] }), { status: 200 });
      }
      // Второй вызов должен содержать явное напоминание про JSON поверх исходных сообщений.
      assert.equal(body.messages.length, 2);
      assert.match(body.messages[1]!.content, /валидным JSON/);
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
    }),
  });

  const result = await provider.completeJSON<{ ok: boolean }>([{ role: 'user', content: 'x' }], { stage: 'entity-matching' });

  assert.equal(callCount, 2);
  assert.deepEqual(result.content, { ok: true });
});

test('completeJSON throws a clear error when both the original call and the retry return malformed JSON', async () => {
  let callCount = 0;
  const provider = new OpenAILLMProvider({
    apiKey: 'sk-test-secret',
    fetchImpl: fakeFetch(() => {
      callCount++;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'not json at all' } }] }), { status: 200 });
    }),
  });

  await assert.rejects(
    () => provider.completeJSON([{ role: 'user', content: 'x' }], { stage: 'entity-matching' }),
    /невалидный JSON.*дважды/,
  );
  assert.equal(callCount, 2);
});

test('throws a descriptive error without leaking the API key on a failed request', async () => {
  const provider = new OpenAILLMProvider({
    apiKey: 'sk-test-secret',
    fetchImpl: fakeFetch(() => new Response('rate limited', { status: 429 })),
  });

  await assert.rejects(
    () => provider.complete([{ role: 'user', content: 'x' }], { stage: 'extract-requirements' }),
    (err: Error) => {
      assert.match(err.message, /429/);
      assert.equal(err.message.includes('sk-test-secret'), false);
      return true;
    },
  );
});

test('estimateTokens is a positive, length-proportional approximation', () => {
  const provider = new OpenAILLMProvider({ apiKey: 'sk-test-secret' });
  assert.ok(provider.estimateTokens('hello world') > 0);
  assert.ok(provider.estimateTokens('a'.repeat(400)) > provider.estimateTokens('a'.repeat(40)));
});

test('sends no Authorization header at all when no API key is configured (most local servers do not check one)', async () => {
  let sawHeaders: Record<string, string> | undefined;
  const provider = new OpenAILLMProvider({
    baseUrl: 'http://localhost:11434/v1',
    fetchImpl: fakeFetch((_url, init) => {
      sawHeaders = init.headers as Record<string, string>;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }), { status: 200 });
    }),
  });

  await provider.complete([{ role: 'user', content: 'hi' }], { stage: 'extract-requirements' });

  assert.equal(sawHeaders?.Authorization, undefined);
});

test('isLocal reflects whether baseUrl points at the official OpenAI cloud endpoint', () => {
  assert.equal(new OpenAILLMProvider({ apiKey: 'sk-test' }).isLocal, false);
  assert.equal(new OpenAILLMProvider({ baseUrl: 'http://localhost:11434/v1' }).isLocal, true);
});

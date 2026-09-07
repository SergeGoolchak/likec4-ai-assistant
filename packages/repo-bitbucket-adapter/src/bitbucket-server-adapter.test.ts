import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BitbucketServerAdapter } from './bitbucket-server-adapter.js';

function fakeFetch(handler: (url: string, init: RequestInit) => Response): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => handler(String(url), init ?? {})) as typeof fetch;
}

const BASE = 'https://bitbucket.example.com';
const REPO_URL = `${BASE}/rest/api/1.0/projects/ENG/repos/architecture`;

function adapter(overrides: Partial<ConstructorParameters<typeof BitbucketServerAdapter>[0]> = {}, handler?: (url: string, init: RequestInit) => Response) {
  return new BitbucketServerAdapter({
    baseUrl: BASE,
    projectKey: 'ENG',
    repoSlug: 'architecture',
    branch: 'main',
    likec4Directory: 'likec4',
    token: 'secret-pat',
    fetchImpl: handler ? fakeFetch(handler) : undefined,
    ...overrides,
  });
}

test('listLikeC4Files pages through all results, filters by directory and extension, and strips the directory prefix', async () => {
  let capturedAuth: string | undefined;
  const client = adapter({}, (url, init) => {
    capturedAuth = (init.headers as Record<string, string>).Authorization;
    if (url.includes('start=0')) {
      return new Response(
        JSON.stringify({
          values: ['likec4/model.c4', 'README.md', 'likec4/services/orders.c4'],
          isLastPage: false,
          nextPageStart: 3,
        }),
        { status: 200 },
      );
    }
    if (url.includes('start=3')) {
      return new Response(JSON.stringify({ values: ['other/ignored.c4', 'likec4/views.likec4'], isLastPage: true }), { status: 200 });
    }
    throw new Error(`unexpected url: ${url}`);
  });

  const files = await client.listLikeC4Files();

  assert.equal(capturedAuth, 'Bearer secret-pat');
  assert.deepEqual(files, ['model.c4', 'services/orders.c4', 'views.likec4']);
});

test('listLikeC4Files returns paths as-is when no likec4Directory is configured (whole repo is the project)', async () => {
  const client = adapter(
    { likec4Directory: undefined },
    () => new Response(JSON.stringify({ values: ['model.c4', 'notes.txt'], isLastPage: true }), { status: 200 }),
  );

  assert.deepEqual(await client.listLikeC4Files(), ['model.c4']);
});

test('readFile requests the raw endpoint under the configured directory and at the configured branch', async () => {
  let capturedUrl = '';
  const client = adapter({}, (url) => {
    capturedUrl = url;
    return new Response('specification {}', { status: 200 });
  });

  const file = await client.readFile('model.c4');

  assert.equal(capturedUrl, `${REPO_URL}/raw/likec4/model.c4?at=refs%2Fheads%2Fmain`);
  assert.deepEqual(file, { path: 'model.c4', content: 'specification {}' });
});

test('writeFiles is not supported and rejects clearly', async () => {
  const client = adapter();
  await assert.rejects(() => client.writeFiles([]), /read-only/i);
});

test('deleteFiles is not supported and rejects clearly', async () => {
  const client = adapter();
  await assert.rejects(() => client.deleteFiles([]), /read-only/i);
});

test('getRevisionInfo returns the branch name and latest commit id', async () => {
  const client = adapter({}, (url) => {
    if (url.includes('/commits')) {
      return new Response(JSON.stringify({ values: [{ id: 'abcdef1234567890' }] }), { status: 200 });
    }
    throw new Error(`unexpected url: ${url}`);
  });

  const info = await client.getRevisionInfo();
  assert.equal(info.branch, 'main');
  assert.equal(info.commit, 'abcdef1234567890');
  assert.ok(info.capturedAt);
});

test('testConnection succeeds on a 200 response', async () => {
  const client = adapter({}, () => new Response('{}', { status: 200 }));
  assert.deepEqual(await client.testConnection(), { ok: true });
});

test('testConnection reports a not-found error on 404', async () => {
  const client = adapter({}, () => new Response('not found', { status: 404 }));
  const result = await client.testConnection();
  assert.equal(result.ok, false);
  assert.equal(result.error?.id, 'bitbucket.not-found');
});

test('testConnection reports an auth error on 401', async () => {
  const client = adapter({}, () => new Response('unauthorized', { status: 401 }));
  const result = await client.testConnection();
  assert.equal(result.ok, false);
  assert.equal(result.error?.id, 'bitbucket.auth-error');
});

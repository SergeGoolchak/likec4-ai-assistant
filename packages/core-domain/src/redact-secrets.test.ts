import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets } from './redact-secrets.js';

test('redacts a Bearer token', () => {
  const input = 'request failed: Authorization: Bearer sk-abcdEFGH12345678901234567890 rejected';
  const result = redactSecrets(input);
  assert.equal(result.includes('sk-abcdEFGH12345678901234567890'), false);
  assert.match(result, /\[REDACTED\]/);
});

test('redacts a bare OpenAI-shaped API key even without a Bearer prefix', () => {
  const result = redactSecrets('key sk-proj-1234567890abcdefghijklmnop leaked in message');
  assert.equal(result.includes('sk-proj-1234567890abcdefghijklmnop'), false);
});

test('redacts an AWS-shaped access key id', () => {
  const result = redactSecrets('found AKIAABCDEFGHIJKLMNOP in config');
  assert.equal(result.includes('AKIAABCDEFGHIJKLMNOP'), false);
});

test('redacts a PEM private key block', () => {
  const pem = '-----BEGIN PRIVATE KEY-----\nMIIBVgIBADANBgkqhkiG9w0BAQ\n-----END PRIVATE KEY-----';
  const result = redactSecrets(`config dump: ${pem}`);
  assert.equal(result.includes('MIIBVgIBADANBgkqhkiG9w0BAQ'), false);
});

test('does not touch short, human-readable test fixtures that only look secret-ish', () => {
  assert.equal(redactSecrets('using sk-test-secret for this test'), 'using sk-test-secret for this test');
  assert.equal(redactSecrets('token: fake-pat-token'), 'token: fake-pat-token');
});

test('leaves ordinary error messages completely unchanged', () => {
  const message = 'Confluence request for page 123456 failed with status 404';
  assert.equal(redactSecrets(message), message);
});

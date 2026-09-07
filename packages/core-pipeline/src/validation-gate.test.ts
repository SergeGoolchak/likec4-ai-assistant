import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasBlockingValidationIssues } from './validation-gate.js';

test('undefined when validationResult is entirely missing', () => {
  assert.equal(hasBlockingValidationIssues(undefined), undefined);
});

test('undefined when only technical has been computed so far (architecture-review has not run yet)', () => {
  assert.equal(hasBlockingValidationIssues({ technical: { ok: true, diagnostics: [] } }), undefined);
});

test('false (clean) when technical is ok and there are no must-findings', () => {
  assert.equal(hasBlockingValidationIssues({ technical: { ok: true, diagnostics: [] }, architectural: { ok: true, findings: [] } }), false);
});

test('true when technical has an error, even with clean architectural findings', () => {
  const result = hasBlockingValidationIssues({
    technical: { ok: false, diagnostics: [{ severity: 'error', message: 'boom', file: 'model.c4' }] },
    architectural: { ok: true, findings: [] },
  });
  assert.equal(result, true);
});

test('true when a "must" architectural finding remains, even if technical is clean', () => {
  const result = hasBlockingValidationIssues({
    technical: { ok: true, diagnostics: [] },
    architectural: { ok: false, findings: [{ ruleId: 'r1', severity: 'must', message: 'dup', affectedItemId: 'i1', autoFixable: false }] },
  });
  assert.equal(result, true);
});

test('false when only "should" findings remain — those are warnings, not blockers', () => {
  const result = hasBlockingValidationIssues({
    technical: { ok: true, diagnostics: [] },
    architectural: { ok: true, findings: [{ ruleId: 'r1', severity: 'should', message: 'maybe dup', affectedItemId: 'i1', autoFixable: false }] },
  });
  assert.equal(result, false);
});

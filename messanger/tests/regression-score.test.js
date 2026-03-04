const assert = require('node:assert/strict');
const test = require('node:test');

const {
  calculateRegressionScore,
  normalizeRegressionWeights,
} = require('../lib/regression-score.ts');

test('regression score uses weighted composite and stays bounded', () => {
  const result = calculateRegressionScore(
    {
      proofBundlePct: 80,
      replaySuccessPct: 60,
      pinnedContextPct: 90,
      harnessPassPct: 70,
    },
    {
      proofBundle: 0.4,
      replaySuccess: 0.3,
      pinnedContext: 0.2,
      harnessPass: 0.1,
    },
  );

  assert.ok(result.value >= 0);
  assert.ok(result.value <= 100);
  assert.ok(result.formula.includes('score ='));
  assert.equal(
    Math.round((result.weights.proofBundle + result.weights.replaySuccess + result.weights.pinnedContext + result.weights.harnessPass) * 1000) / 1000,
    1,
  );
});

test('weights renormalize when harness metric is absent', () => {
  const normalized = normalizeRegressionWeights(
    {
      proofBundle: 2,
      replaySuccess: 2,
      pinnedContext: 1,
      harnessPass: 5,
    },
    false,
  );

  assert.equal(normalized.harnessPass, 0);
  assert.equal(
    Math.round((normalized.proofBundle + normalized.replaySuccess + normalized.pinnedContext) * 1000) / 1000,
    1,
  );
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { parseMetricsSnapshot, parseRunsSnapshot } = require('../lib/regression-schema.ts');

test('metrics parser keeps required numeric fields and score bounds', () => {
  const metricsPath = path.join(process.cwd(), 'public', 'data', 'metrics.json');
  const payload = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
  const parsed = parseMetricsSnapshot(payload);

  assert.equal(typeof parsed.data.generatedAt, 'string');
  assert.ok(parsed.data.tokens.total >= 0);
  assert.ok(parsed.data.runs.total >= 0);
  assert.ok(parsed.data.regressionScore.value >= 0);
  assert.ok(parsed.data.regressionScore.value <= 100);
  assert.ok(parsed.data.regressionScore.formula.includes('score ='));
});

test('runs parser normalizes run rows with required identifiers', () => {
  const runsPath = path.join(process.cwd(), 'public', 'data', 'runs.json');
  const payload = JSON.parse(fs.readFileSync(runsPath, 'utf8'));
  const parsed = parseRunsSnapshot(payload);

  assert.ok(parsed.data.runs.length > 0);
  for (const run of parsed.data.runs) {
    assert.ok(run.id.length > 0);
    assert.ok(run.timestamp.length > 0);
    assert.ok(typeof run.tokens === 'number');
    assert.ok(run.detailPath.startsWith('/runs/'));
  }
});

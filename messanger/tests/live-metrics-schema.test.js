const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseLiveMetricsSnapshot,
  parseTokensAggregateFile,
} = require('../lib/live-metrics-schema.ts');

test('tokens aggregate parser validates expected shape', () => {
  const parsed = parseTokensAggregateFile({
    updated_at: '2026-02-14T00:00:00.000Z',
    tokens_total: 1000,
    tokens_24h: 100,
    tokens_7d: 700,
    source: 'manual',
  });

  assert.equal(parsed.data.tokensTotal, 1000);
  assert.equal(parsed.data.tokens24h, 100);
  assert.equal(parsed.data.tokens7d, 700);
  assert.equal(parsed.data.source, 'manual');
});

test('tokens parser supports snapshot payload and derives windows', () => {
  const parsed = parseTokensAggregateFile({
    source: 'codex/usage',
    snapshots: [
      { timestamp: '2026-02-08T00:00:00.000Z', tokens_total: 1000 },
      { timestamp: '2026-02-14T00:00:00.000Z', tokens_total: 1600 },
      { timestamp: '2026-02-15T00:00:00.000Z', tokens_total: 1700 },
    ],
  });

  assert.equal(parsed.data.source, 'codex/usage');
  assert.equal(parsed.data.tokensTotal, 1700);
  assert.equal(parsed.data.tokens24h, 100);
  assert.equal(parsed.data.tokens7d, 700);
});

test('tokens parser supports top-level snapshot array payload', () => {
  const parsed = parseTokensAggregateFile([
    { timestamp: '2026-02-08T00:00:00.000Z', tokens_total: 500 },
    { timestamp: '2026-02-15T00:00:00.000Z', tokens_total: 900 },
  ]);

  assert.equal(parsed.data.tokensTotal, 900);
  assert.equal(parsed.data.source, 'snapshot');
});

test('tokens parser supports numeric strings and unix timestamps', () => {
  const parsed = parseTokensAggregateFile({
    source: 'publisher',
    snapshots: [
      { timestamp: 1739328000, total_tokens: '1200' },
      { timestamp: 1739414400, total_tokens: '1500', tokens_24h: '300', tokens_7d: '300' },
    ],
  });

  assert.equal(parsed.data.tokensTotal, 1500);
  assert.equal(parsed.data.tokens24h, 300);
  assert.equal(parsed.data.tokens7d, 300);
  assert.equal(parsed.data.source, 'publisher');
});

test('tokens parser supports run snapshots with at/tokens schema', () => {
  const parsed = parseTokensAggregateFile({
    snapshots: [
      { at: '2026-02-15T01:12:29Z', run_id: 'r1', source: 'codex/usage', tokens: 0 },
      { at: '2026-02-15T01:16:33Z', run_id: 'r2', source: 'codex/usage', tokens: 0 },
      { at: '2026-02-15T01:33:32Z', run_id: 'r3', source: 'codex/usage', tokens: 200 },
      { at: '2026-02-15T01:34:26Z', run_id: 'r4', source: 'codex/usage', tokens: 200 },
      { at: '2026-02-15T01:54:07Z', run_id: 'r5', source: 'codex/usage', tokens: 2813720 },
      { at: '2026-02-15T02:08:16Z', run_id: 'r6', source: 'codex/usage', tokens: 3427746 },
      { at: '2026-02-15T02:20:32Z', run_id: 'r7', source: 'codex/usage', tokens: 1959561 },
      { at: '2026-02-15T02:34:35Z', run_id: 'r8', source: 'codex/usage', tokens: 3231875 },
      { at: '2026-02-15T02:49:29Z', run_id: 'r9', source: 'codex/usage', tokens: 5055653 },
    ],
  });

  assert.equal(parsed.data.updatedAt, '2026-02-15T02:49:29.000Z');
  assert.equal(parsed.data.tokensTotal, 16488955);
  assert.equal(parsed.data.tokens24h, 16488955);
  assert.equal(parsed.data.tokens7d, 16488955);
  assert.equal(parsed.data.source, 'codex/usage');
});

test('live metrics parser keeps required numeric KPIs bounded', () => {
  const parsed = parseLiveMetricsSnapshot({
    generatedAt: '2026-02-14T00:00:00.000Z',
    refreshIntervalSeconds: 60,
    repository: {
      owner: 'o',
      name: 'r',
      fullName: 'o/r',
      url: 'https://github.com/o/r',
    },
    tokens: {
      updatedAt: '2026-02-14T00:00:00.000Z',
      tokensTotal: 100,
      tokens24h: 10,
      tokens7d: 70,
      source: 'manual',
    },
    stars: 1,
    forks: 2,
    watchers: 3,
    openIssues: 4,
    openPullRequests: 5,
    mergedPullRequests7d: 6,
    commits7d: 7,
    branch: {
      name: 'main',
      commitSha: 'abc',
      committedAt: '2026-02-14T00:00:00.000Z',
      status: 'success',
    },
    ci: {
      workflow: 'ci',
      conclusion: 'success',
      updatedAt: '2026-02-14T00:00:00.000Z',
    },
    commitWeeklyTrend: [{ time: '2026-02-01', value: 1 }],
    mergedPrDailyTrend: [{ time: '2026-02-10', value: 1 }],
    issues: [],
  });

  assert.equal(parsed.data.repository.fullName, 'o/r');
  assert.ok(parsed.data.stars >= 0);
  assert.ok(parsed.data.commits7d >= 0);
  assert.ok(parsed.data.tokens.tokensTotal >= 0);
});

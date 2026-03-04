const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('live metrics are sourced from GitHub APIs and external tokens repo config', () => {
  const metricsSource = read('lib/github-metrics.ts');
  const apiRoute = read('app/api/metrics/route.ts');

  assert.match(metricsSource, /https:\/\/api\.github\.com\/graphql/);
  assert.match(metricsSource, /TOKENS_REPO_OWNER/);
  assert.match(metricsSource, /TOKENS_REPO_NAME/);
  assert.match(metricsSource, /TOKENS_FILE_PATH/);
  assert.match(metricsSource, /If-None-Match/);
  assert.match(apiRoute, /getLiveMetricsSnapshot/);
});

test('landing repo does not reference local codex run logs', () => {
  const files = ['lib/github-metrics.ts', 'docs/site.md', 'MIGRATION.md'];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /CODEX_RUNS_DIR|\.codex-runs\/\*\*|loadCodexRuns/,
      `${file} should not depend on local codex run logs`,
    );
  }
});

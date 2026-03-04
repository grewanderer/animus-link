const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('metrics publisher template files exist', () => {
  const files = [
    'metrics-publisher-template/README.md',
    'metrics-publisher-template/scripts/publish-tokens.mjs',
    'metrics-publisher-template/.github/workflows/publish-tokens.yml',
    'metrics-publisher-template/public/data/tokens.json',
  ];

  for (const file of files) {
    assert.ok(fs.existsSync(path.join(process.cwd(), file)), `${file} is missing`);
  }
});

test('tokens template schema contains required aggregate keys', () => {
  const source = read('metrics-publisher-template/public/data/tokens.json');
  const payload = JSON.parse(source);

  assert.equal(typeof payload.updated_at, 'string');
  assert.equal(typeof payload.tokens_total, 'number');
  assert.equal(typeof payload.tokens_24h, 'number');
  assert.equal(typeof payload.tokens_7d, 'number');
  assert.equal(typeof payload.source, 'string');
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const routeFiles = [
  'app/page.tsx',
  'app/research/page.tsx',
  'app/metrics/page.tsx',
  'app/dashboard/page.tsx',
  'app/runs/page.tsx',
  'app/runs/[id]/page.tsx',
  'app/artifacts/page.tsx',
  'app/docs/page.tsx',
  'app/paper/page.tsx',
  'app/community/page.tsx',
];

test('key Regression Engineering routes exist', () => {
  for (const relativePath of routeFiles) {
    const absolutePath = path.join(process.cwd(), relativePath);
    assert.ok(fs.existsSync(absolutePath), `${relativePath} is missing`);
  }
});

test('global layout always renders top tabs shell', () => {
  const layoutPath = path.join(process.cwd(), 'app', 'layout.tsx');
  const source = fs.readFileSync(layoutPath, 'utf8');

  assert.match(source, /<TopTabs\s+initialLocale=\{locale\}\s*\/>/);
});

test('top tabs include Research and Datalab targets', () => {
  const tabsPath = path.join(process.cwd(), 'components', 'navigation', 'top-tabs.tsx');
  const source = fs.readFileSync(tabsPath, 'utf8');

  assert.match(source, /localizeSitePath\(locale,\s*'\/'\)/);
  assert.match(source, /datalabRootPath\(locale\)/);
  assert.match(source, /t\('nav\.research'\)/);
  assert.match(source, /t\('product\.datalab'\)/);
  assert.match(source, /localizedPathByLocale\(nextLocale,\s*browserPathname\)/);
  assert.match(source, /onClick=\{\(\) => switchLocale\(item\)\}/);
  assert.match(source, /window\.location\.search/);
  assert.match(source, /split\('\?'\)/);
  assert.match(source, /window\.location\.assign/);
});

test('top tabs keep compact unified header links and remove secondary IA tabs', () => {
  const tabsPath = path.join(process.cwd(), 'components', 'navigation', 'top-tabs.tsx');
  const source = fs.readFileSync(tabsPath, 'utf8');

  assert.doesNotMatch(source, /nav\.liveMetrics/);
  assert.doesNotMatch(source, /nav\.method/);
  assert.doesNotMatch(source, /regressionRepo\.webBase/);
  assert.doesNotMatch(source, /regression-nav/);
});

test('/datalab deep-link rewrites and redirects stay configured', () => {
  const nextConfigPath = path.join(process.cwd(), 'next.config.js');
  const middlewarePath = path.join(process.cwd(), 'middleware.ts');
  const nextConfigSource = fs.readFileSync(nextConfigPath, 'utf8');
  const middlewareSource = fs.readFileSync(middlewarePath, 'utf8');

  assert.doesNotMatch(nextConfigSource, /source:\s*'\/datalab',\s*destination:\s*'\/en'/);
  assert.doesNotMatch(nextConfigSource, /source:\s*'\/datalab\/docs',\s*destination:\s*'\/en\/docs'/);
  assert.match(nextConfigSource, /source:\s*'\/datalab\/:locale\(en\|ru\|es\|zh-CN\|ja\)'/);
  assert.match(nextConfigSource, /source:\s*'\/datalab\/:locale\(en\|ru\|es\|zh-CN\|ja\)\/:path\*'/);
  assert.match(middlewareSource, /LEGACY_DATALAB_LOCALE_PATH/);
  assert.match(middlewareSource, /en\|ru\|es\|zh-CN\|ja/);
  assert.match(middlewareSource, /buildDatalabPath/);
  assert.match(middlewareSource, /if \(!pathLocale \|\| !hasCanonicalLocaleSegment\)/);
  assert.match(middlewareSource, /target\.pathname = buildDatalabPath\(locale,\s*trailing\)/);
  assert.match(middlewareSource, /target\.pathname = `\/datalab\$\{pathname\}`/);
  assert.match(middlewareSource, /pathname\.startsWith\('\/datalab'\)/);
  assert.match(middlewareSource, /resolvedLocale === defaultSiteLocale/);
});

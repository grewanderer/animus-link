const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = process.cwd();

test('VizPanel keeps canonical Datalab visualization geometry contract', () => {
  const vizPanelPath = path.join(ROOT, 'components', 'viz', 'viz-panel.tsx');
  const source = fs.readFileSync(vizPanelPath, 'utf8');

  const requiredClass =
    'relative z-10 flex min-h-[260px] items-end justify-end px-6 pb-8 pt-10 sm:min-h-[320px]';

  assert.match(source, /export function VizPanel/);
  assert.ok(
    source.includes(requiredClass),
    `VizPanel is missing canonical container class: ${requiredClass}`,
  );
});

test('regression visualization components import and use VizPanel', () => {
  const regressionDir = path.join(ROOT, 'components', 'regression');
  const files = fs
    .readdirSync(regressionDir)
    .filter((file) => file.endsWith('.tsx'))
    .filter((file) => /(chart|spark|trend|graph|metric|scoreboard)/i.test(file));

  assert.ok(files.length > 0, 'No regression visualization files matched enforcement rule');

  const findings = [];
  for (const file of files) {
    const absolute = path.join(regressionDir, file);
    const source = fs.readFileSync(absolute, 'utf8');
    const hasImport = source.includes("from '@/components/viz/viz-panel'");
    const hasUsage = /<VizPanel[\s>]/.test(source);

    if (!hasImport || !hasUsage) {
      findings.push(`components/regression/${file}`);
    }
  }

  assert.deepEqual(
    findings,
    [],
    `Visualization component(s) missing VizPanel import/usage:\n${findings.join('\n')}`,
  );
});

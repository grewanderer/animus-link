const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = process.cwd();

function walkTsx(directory) {
  const results = [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTsx(absolute));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.tsx')) {
      results.push(absolute);
    }
  }
  return results;
}

function toRelative(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, '/');
}

function targetFiles() {
  const files = new Set();
  const appFiles = walkTsx(path.join(ROOT, 'app'));
  for (const file of appFiles) {
    const relative = toRelative(file);
    if (relative.startsWith('app/[locale]/')) continue;
    if (relative.startsWith('app/api/')) continue;
    files.add(file);
  }

  const componentFiles = [
    ...walkTsx(path.join(ROOT, 'components', 'regression')),
    ...walkTsx(path.join(ROOT, 'components', 'viz')),
    path.join(ROOT, 'components', 'navigation', 'top-tabs.tsx'),
  ];
  componentFiles.forEach((file) => files.add(file));

  return [...files];
}

test('new-site TSX does not contain hardcoded user-facing text nodes', () => {
  const files = targetFiles();
  const findings = [];

  const textNodePattern = />\s*([^<{][^<{]*?)\s*</g;
  const attrPattern = /\b(aria-label|title|placeholder|alt)=["']([^"']*[\p{L}][^"']*)["']/gu;

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const relative = toRelative(file);
    const lines = source.split('\n');

    for (const line of lines) {
      let match;
      while ((match = textNodePattern.exec(line))) {
        const value = (match[1] ?? '').trim();
        if (!value) continue;
        if (!/[\p{L}]/u.test(value)) continue;
        if (/[()=]/.test(value)) continue;
        if (value === '→') continue;
        findings.push(`${relative}: text node "${value}"`);
      }
      textNodePattern.lastIndex = 0;
    }

    let match;
    while ((match = attrPattern.exec(source))) {
      const attr = match[1];
      const value = (match[2] ?? '').trim();
      if (!value) continue;
      findings.push(`${relative}: ${attr}="${value}"`);
    }
  }

  assert.deepEqual(findings, [], `Hardcoded user-facing strings found:\n${findings.join('\n')}`);
});

import fs from 'fs';
import path from 'path';
import vm from 'vm';

function extractObjectLiteral(source, marker) {
  const idx = source.indexOf(marker);
  if (idx === -1) throw new Error(`Marker not found: ${marker}`);
  const eqIdx = source.indexOf('=', idx);
  if (eqIdx === -1) throw new Error(`Assignment not found for marker: ${marker}`);
  const braceStart = source.indexOf('{', eqIdx);
  if (braceStart === -1) throw new Error(`Opening brace not found for marker: ${marker}`);
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let escape = false;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
        stringChar = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart, i + 1);
      }
    }
  }
  throw new Error(`Matching brace not found for marker: ${marker}`);
}

function hashString(value) {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

const docsSource = fs.readFileSync('lib/docs-content.ts', 'utf8');
const docsEnLiteral = extractObjectLiteral(docsSource, 'const docsContentEn');
const docsRuLiteral = extractObjectLiteral(docsSource, 'const docsContentRu');

const docsContentEn = vm.runInNewContext(`(${docsEnLiteral})`);
const docsContentRu = vm.runInNewContext(`(${docsRuLiteral})`);

const localeSources = {
  en: docsContentEn,
  ru: docsContentRu,
  es: docsContentEn,
};

function buildEntries(locale, content) {
  const entries = [];
  for (const page of content.pages) {
    const pageContent = [];
    for (const section of page.sections) {
      if (section.body) pageContent.push(section.body.join(' '));
      if (section.bullets) pageContent.push(section.bullets.join(' '));
      if (section.note) pageContent.push(`${section.note.title} ${section.note.body}`);
    }

    entries.push({
      docId: `${page.slug}`,
      slug: page.slug,
      title: page.title,
      section: page.title,
      heading: page.title,
      headingId: null,
      content: `${page.description} ${pageContent.join(' ')}`.trim(),
      keywords: page.keywords ?? [],
      url: `/${locale}/docs/${page.slug}`,
    });

    for (const section of page.sections) {
      const sectionContent = [];
      if (section.body) sectionContent.push(section.body.join(' '));
      if (section.bullets) sectionContent.push(section.bullets.join(' '));
      if (section.note) sectionContent.push(`${section.note.title} ${section.note.body}`);
      entries.push({
        docId: `${page.slug}#${section.id}`,
        slug: page.slug,
        title: page.title,
        section: page.title,
        heading: section.title,
        headingId: section.id,
        content: `${page.description} ${sectionContent.join(' ')}`.trim(),
        keywords: page.keywords ?? [],
        url: `/${locale}/docs/${page.slug}#${section.id}`,
      });
    }
  }
  return entries;
}

const outDir = path.join('public', 'search');
fs.mkdirSync(outDir, { recursive: true });

for (const [locale, content] of Object.entries(localeSources)) {
  const entries = buildEntries(locale, content);
  const version = `v1-${hashString(JSON.stringify(entries))}`;
  const index = {
    version,
    locale,
    generatedAt: new Date().toISOString(),
    entries,
  };
  const outPath = path.join(outDir, `index.${locale}.json`);
  fs.writeFileSync(outPath, JSON.stringify(index, null, 2));
  console.log(`Wrote ${outPath}`);
}

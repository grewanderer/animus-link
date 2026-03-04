const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(process.cwd(), 'lib', 'site-translations.ts'), 'utf8');

const localizedResearchCardKeys = [
  'home.impact.card.1.title',
  'home.impact.card.1.description',
  'home.impact.card.2.title',
  'home.impact.card.2.description',
  'home.impact.card.3.title',
  'home.impact.card.3.description',
  'home.trajectory.phase.0.title',
  'home.trajectory.phase.0.description',
  'home.trajectory.phase.1.title',
  'home.trajectory.phase.1.description',
  'home.trajectory.phase.2.title',
  'home.trajectory.phase.2.description',
  'home.footerCall.live',
  'home.footerCall.code',
];

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end);
  assert.ok(from >= 0 && to > from, `failed to find section range: ${start}..${end}`);
  return source.slice(from, to);
}

test('research cards have explicit localized keys for es/zh-CN/ja', () => {
  const sections = {
    es: section('const es: SiteTranslationMap = {', 'const fr: SiteTranslationMap = {'),
    'zh-CN': section('const zhCN: SiteTranslationMap = {', 'const ja: SiteTranslationMap = {'),
    ja: section('const ja: SiteTranslationMap = {', 'const translationMaps: Record<string, SiteTranslationMap> = {'),
  };

  for (const [locale, dictionarySection] of Object.entries(sections)) {
    for (const key of localizedResearchCardKeys) {
      assert.match(
        dictionarySection,
        new RegExp(`'${key.replaceAll('.', '\\.')}':`),
        `missing localized key ${key} in ${locale}`,
      );
    }
  }
});

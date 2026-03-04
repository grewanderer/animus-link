const assert = require('node:assert/strict');
const test = require('node:test');

const {
  defaultSiteLocale,
  localizeSitePath,
  normalizeSiteLocale,
  parseSiteLocaleFromAnyPath,
  parseSiteLocaleFromPath,
  siteLocales,
  stripSiteLocalePrefix,
} = require('../lib/site-locale.ts');

test('locale catalog includes supported global locales', () => {
  const required = ['en', 'ru', 'es', 'zh-CN', 'ja'];
  for (const locale of required) {
    assert.ok(siteLocales.includes(locale), `missing locale: ${locale}`);
  }
});

test('path prefix parsing resolves valid locale and strips prefix', () => {
  assert.equal(parseSiteLocaleFromPath('/l/es/metrics'), 'es');
  assert.equal(parseSiteLocaleFromPath('/l/ru/research'), 'ru');
  assert.equal(parseSiteLocaleFromPath('/metrics'), undefined);

  assert.deepEqual(stripSiteLocalePrefix('/l/es/metrics'), {
    locale: 'es',
    pathname: '/metrics',
  });
  assert.deepEqual(stripSiteLocalePrefix('/l/ru'), {
    locale: 'ru',
    pathname: '/',
  });
  assert.deepEqual(stripSiteLocalePrefix('/l/invalid/metrics'), {
    pathname: '/l/invalid/metrics',
  });
});

test('generic locale parser resolves datalab and legacy locale paths', () => {
  assert.equal(parseSiteLocaleFromAnyPath('/l/ru/metrics'), 'ru');
  assert.equal(parseSiteLocaleFromAnyPath('/datalab/ru'), 'ru');
  assert.equal(parseSiteLocaleFromAnyPath('/datalab/zh/docs'), 'zh-CN');
  assert.equal(parseSiteLocaleFromAnyPath('/datalab/zh-CN/docs'), 'zh-CN');
  assert.equal(parseSiteLocaleFromAnyPath('/ja/docs'), 'ja');
  assert.equal(parseSiteLocaleFromAnyPath('/datalab/docs'), undefined);
  assert.equal(parseSiteLocaleFromAnyPath('/metrics'), undefined);
});

test('localized paths preserve default locale without prefix', () => {
  assert.equal(defaultSiteLocale, 'en');
  assert.equal(localizeSitePath('en', '/metrics'), '/metrics');
  assert.equal(localizeSitePath('ru', '/metrics'), '/l/ru/metrics');
  assert.equal(localizeSitePath('es', '/'), '/l/es');
  assert.equal(localizeSitePath('zh-CN', '/metrics'), '/l/zh-CN/metrics');
  assert.equal(localizeSitePath('ja', '/metrics'), '/l/ja/metrics');
});

test('locale normalization supports aliases and unknown fallback', () => {
  assert.equal(normalizeSiteLocale('EN-us'), 'en');
  assert.equal(normalizeSiteLocale('ru-ru'), 'ru');
  assert.equal(normalizeSiteLocale('es-mx'), 'es');
  assert.equal(normalizeSiteLocale('zh'), 'zh-CN');
  assert.equal(normalizeSiteLocale('zh-hans'), 'zh-CN');
  assert.equal(normalizeSiteLocale('ja-jp'), 'ja');
  assert.equal(normalizeSiteLocale('xx'), undefined);
});

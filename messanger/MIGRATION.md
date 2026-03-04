# Migration Notes

## Locale routing strategy
- Primary strategy: locale-aware paths under `/l/{locale}/...` for the new public site.
- Default locale (`en`) is served without prefix on canonical paths (`/`, `/metrics`, ...).
- Non-default locales resolve through middleware rewrite:
  - `/l/es/metrics` -> internal `/metrics` with request locale `es`.
- Locale persistence:
  - cookie `site_locale`
  - request header `x-site-locale` (set by middleware for rewritten requests).

## Datalab preservation strategy
- Legacy Datalab application remains mounted from existing `app/[locale]/**`.
- Legacy content and copy are preserved; no structural rewrite is introduced.
- Public Datalab entrypoints:
  - `/datalab` -> middleware redirect to `/datalab/{resolved-locale}`
  - `/datalab/docs` -> middleware redirect to `/datalab/{resolved-locale}/docs`
  - `/datalab/:locale(en|ru|es|zh-CN|ja)` -> `/:locale`
  - `/datalab/:locale(en|ru|es|zh-CN|ja)/:path*` -> `/:locale/:path*`
- Legacy deep links are preserved:
  - direct `/en|/ru|/es|/zh-CN|/ja/...` requests are redirected by middleware to `/datalab/...`.
- Locale switcher remains available in global shell on `/datalab/*`, but legacy Datalab copy remains unchanged.

## Translation strategy and fallback
- New-site UI strings are centralized in `lib/site-translations.ts`.
- Supported locale set (routing + shell):  
  `en, ru, es, zh-CN, ja`
- Translation dictionaries:
  - complete baseline: `en`
  - dedicated dictionaries: `ru`, `es`, `zh-CN`, `ja`
- Missing key behavior:
  - fallback to EN when localized key is absent
  - dev-time warning log for missing/fallback keys (`[site-i18n] ...`).

## Naming policy
- New project naming is standardized to:
  - EN: `Regression Engineering`
  - RU: `Регрессионная инженерия`
- Legacy project naming has been removed from new-site UI and migration docs.

## New-site route map
- `/` -> Regression Engineering landing
- `/research` -> landing alias
- `/metrics` (`/dashboard` redirects)
- `/docs` (redirect to `/`)
- `/paper` (`/report` redirects)
- `/runs`, `/runs/:id`, `/artifacts` (redirect to `/metrics`)
- `/community` (redirect to `/`)

## Metrics pipeline
- Landing repository reads live GitHub APIs at runtime.
- Tokens aggregate is fetched from a separate Metrics Publisher repository (`public/data/tokens.json` by default).
- Landing repository does not generate or publish token aggregates.

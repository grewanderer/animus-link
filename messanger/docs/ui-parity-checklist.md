# UI Parity Checklist

This checklist is used to verify that Regression Engineering renders as a Datalab-family product while preserving legacy Datalab unchanged under `/datalab/*`.

## Shell and navigation
- [ ] Global header uses Datalab geometry (`max-w-6xl`, same spacing cadence).
- [ ] Top tabs include exactly two product tabs: Regression Engineering and Datalab.
- [ ] Locale switcher is present in global shell on all pages.
- [ ] Locale switcher is accessible (label + keyboard navigation).
- [ ] Research tab resolves to localized path strategy.
- [ ] Datalab tab resolves to `/datalab` route family.
- [ ] `/datalab/*` deep links remain functional.

## Typography and spacing
- [ ] Base font family matches Datalab token stack.
- [ ] Monospace fields use shared mono token stack.
- [ ] Eyebrow styling matches Datalab (`text-xs uppercase tracking` pattern).
- [ ] Heading scale/line-height matches Datalab.
- [ ] Inter-section spacing follows shared `space-y-*` cadence.
- [ ] Card padding/radius/shadow matches `components/ui/card.tsx`.

## Colors and tokens
- [ ] No new color palette introduced outside tokenized classes.
- [ ] Border/background usage aligns with Datalab card surfaces.
- [ ] Status tones use existing semantic palette (success/failure/pending).
- [ ] Buttons use shared Datalab button variants.
- [ ] Badges use shared Datalab badge styling.

## Visualization contract
- [ ] Every chart/metric/scoreboard instrument is wrapped by `VizPanel`.
- [ ] VizPanel container includes required geometry:
  - [ ] `relative z-10`
  - [ ] `flex items-end justify-end`
  - [ ] `min-h-[260px] sm:min-h-[320px]`
  - [ ] `px-6 pt-10 pb-8`
- [ ] VizPanel supports optional title/subtitle.
- [ ] VizPanel supports top-right controls.
- [ ] VizPanel supports optional footer metadata strip.
- [ ] No bare chart is rendered on a flat unframed background.

## Data and tables
- [ ] Live metrics use GitHub APIs and external published tokens JSON.
- [ ] Metrics/runs/artifacts surfaces show loading and error states.
- [ ] Legacy routes (`/runs`, `/artifacts`, `/community`) redirect to production surface.
- [ ] External tokens aggregate path is env-configurable and schema-validated.

## i18n and naming
- [ ] New-site user strings are dictionary-backed (`lib/site-translations.ts`).
- [ ] Missing keys fall back to EN.
- [ ] Missing/fallback key warnings appear in development.
- [ ] Required locales include dedicated dictionaries: `en`, `ru`, `es`, `zh-CN`.
- [ ] Project naming is `Regression Engineering` / `Регрессионная инженерия`.
- [ ] Legacy project naming is removed from UI and metadata.

## Accessibility and quality
- [ ] Landmark structure (`header/main/nav/section`) is semantic.
- [ ] Tables/charts expose `aria-label` where needed.
- [ ] Keyboard navigation works for tabs, filters, and locale switcher.
- [ ] No console errors on primary routes.
- [ ] Lint, typecheck, tests, and build pass.

## Documented parity exceptions
- None.

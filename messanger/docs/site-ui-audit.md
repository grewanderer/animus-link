# Site UI Audit

## Scope
- Frontend root: `closed/messanger/**`
- Legacy Datalab baseline: `app/[locale]/**`, `sections/landing/**`, `components/ui/**`
- New Regression Engineering pages: `app/{page,research,metrics,dashboard,runs,method,artifacts,docs,paper,community}/**`

## Token sources
- CSS variables and base typography:
  - `styles/globals.css`
  - `:root` variables (`--background`, `--foreground`, `--primary`, `--radius`, etc.)
  - font stack (`Space Grotesk`, `JetBrains Mono`)
- Tailwind token wiring:
  - `tailwind.config.ts`
  - color aliases (`background`, `foreground`, `primary`, `card`, `border`)
  - glow shadows and radius extensions (`glow-sm`, `glow-md`, `--radius`)

## Layout primitives
- Global shell and page width:
  - `app/layout.tsx`
  - `max-w-6xl`, `px-4 sm:px-6 lg:px-10`, `py-8`
- Legacy Datalab shell:
  - `app/[locale]/layout.tsx`
  - header/footer card geometry and spacing cadence
- Panel geometry contract for visual instruments:
  - `components/viz/viz-panel.tsx`
  - required container class:
    - `relative z-10 flex min-h-[260px] items-end justify-end px-6 pb-8 pt-10 sm:min-h-[320px]`

## Component sources reused by new pages
- Cards/panels: `components/ui/card.tsx`
- Buttons: `components/ui/button.tsx`
- Badges: `components/ui/badge.tsx`
- Navigation shell:
  - `components/navigation/top-tabs.tsx`
  - `components/regression/regression-nav.tsx`
- Visualization wrapper:
  - `components/viz/viz-panel.tsx`
  - `components/viz/trend-sparkline.tsx`

## Reuse patterns required on new pages
- Card-first layout for hero, KPI, method, artifacts, and docs blocks
- No route-specific CSS files; utility classes + existing UI components only
- Shared typography cadence:
  - eyebrow: `text-xs uppercase tracking-[0.3em]`
  - h1/h2 scale from Datalab (`text-3xl`/`text-4xl`, `font-semibold`)
- Table styling parity:
  - rounded panel, bordered container, sticky header, row hover state
- Status semantics:
  - tone classes align with existing Datalab success/failure/pending palette

## New pages audited for parity
- `app/page.tsx` and `components/regression/research-home.tsx`
- `app/metrics/page.tsx` and `components/regression/live-metrics-dashboard.tsx`
- `app/docs/page.tsx` (redirect)
- `app/runs/page.tsx`, `app/runs/[id]/page.tsx`, `app/artifacts/page.tsx` (redirect)
- `app/paper/page.tsx`, `app/report/page.tsx`, `app/community/page.tsx` (redirect)

## Divergence notes
- No standalone visual theme introduced.
- No page-specific CSS added for the new site.
- Legacy Datalab content remains under `/datalab/*`; only routing/shell integration changed.

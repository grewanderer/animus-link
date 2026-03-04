# Site Metrics Architecture

## Scope
- Landing repository renders the website and fetches live metrics.
- Tokens aggregate is published by a **separate Metrics Publisher repository**.
- Landing does **not** read `.codex-runs`, local run logs, or CI artifact dumps.

## Production routes
- `/` Research landing (localized)
- `/metrics` Live metrics (localized)
- `/datalab/*` Legacy Datalab content (unchanged)

## Data sources

### GitHub repository metrics (Landing repo runtime)
Landing fetches repository signals from GitHub APIs:
- stars, forks, watchers
- open issues
- open PR count
- merged PR count (7d)
- commits (7d) from `main-work`
- `main-work` latest commit + status
- latest workflow run status
- latest release tag/date from `main`
- cycle observatory windows (`24h`, `7d`) with deterministic anchors and derived indices

Implementation:
- `lib/github-metrics.ts`
- `app/api/metrics/route.ts`
- GraphQL for core metrics
- REST for workflow/commit-activity details
- refresh interval:
  - authenticated (`GITHUB_TOKEN`): from `METRICS_REFRESH_SECONDS` (default `60s`)
  - unauthenticated: auto-throttled to at least `600s` to reduce API quota exhaustion
- `window` query (`24h` or `7d`) is handled client-side and preserved on locale switch

### Tokens aggregate (external repository)
Landing fetches a JSON file from another GitHub repository:
- default path: `metrics/token_usage_snapshots.json`
- env-configurable owner/repo/path/ref
- fetched through GitHub Contents API with ETag/conditional request support
- runtime validation in `lib/live-metrics-schema.ts`

Supported schemas:

Aggregate payload:
```json
{
  "updated_at": "ISO-8601",
  "tokens_total": 0,
  "tokens_24h": 0,
  "tokens_7d": 0,
  "source": "manual|codex/usage|..."
}
```

Snapshots payload (event-style example):
```json
{
  "snapshots": [
    {
      "at": "ISO-8601",
      "run_id": "20260215T014220Z-cycle-1",
      "source": "codex/usage",
      "tokens": 2813720
    }
  ]
}
```

If snapshots are provided:
- event schema (`run_id` + `tokens`) is treated as per-run events:
  - `tokens_total = sum(tokens)`
  - `tokens_24h` / `tokens_7d` = window sums
- aggregate schema (`tokens_total`) is treated as cumulative snapshots.

## Landing configuration

Required:
- `NEXT_PUBLIC_SITE_URL`
- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- `TOKENS_REPO_OWNER`
- `TOKENS_REPO_NAME`
- `TOKENS_FILE_PATH` (default `metrics/token_usage_snapshots.json`)

Optional:
- `GITHUB_TOKEN` (recommended in production; without token GitHub quota can make metrics temporarily unavailable)
- `TOKENS_FILE_REF` (default `main-work`)
- `GITHUB_METRICS_BRANCH` (default `main-work`)
- `GITHUB_RELEASE_BRANCH` (default `main`)
- `TOKENS_STALE_HOURS` (default `24`)
- `TOKEN_BUDGET_24H` (default `0`, disabled)
- `TOKEN_BUDGET_7D` (default `0`, disabled)
- `WORKFLOW_TARGET_DURATION_SECONDS` (default `1800`)
- `PR_LEAD_TIME_TARGET_HOURS` (default `24`)
- `METRICS_REFRESH_SECONDS` (default `60`, auto-throttled to `>=600` without token)
- `TOKENS_REFRESH_SECONDS` (default `60`)
- `METRICS_CLIENT_REFRESH_SECONDS` (default `60`)

## Metrics Publisher bundle

A ready-to-apply bundle for the external publisher repo is included at:
- `metrics-publisher-template/README.md`
- `metrics-publisher-template/scripts/publish-tokens.mjs`
- `metrics-publisher-template/.github/workflows/publish-tokens.yml`
- `metrics-publisher-template/public/data/tokens.json`

Copy that bundle into the separate Metrics Publisher repository and enable the workflow.

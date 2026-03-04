# Metrics Publisher Template

This folder is a ready-to-apply bundle for the **external Metrics Publisher repository**.

## Purpose
- Publish a single aggregate JSON file for tokens:
  - `public/data/tokens.json`
- Keep only aggregate values (no prompts, logs, or transcripts).
- Provide a stable source for the Landing repository.

## Output schema

```json
{
  "updated_at": "2026-02-13T00:00:00.000Z",
  "tokens_total": 0,
  "tokens_24h": 0,
  "tokens_7d": 0,
  "source": "manual"
}
```

## Files
- `.github/workflows/publish-tokens.yml`:
  - scheduled + manual workflow
  - runs publisher script
  - commits `public/data/tokens.json` if changed
- `scripts/publish-tokens.mjs`:
  - computes aggregate payload
  - supports manual override and optional HTTP JSON source
- `public/data/tokens.json`:
  - current published aggregate snapshot

## Source modes

### 1) Manual mode (default)
Set repository variables/secrets:
- `TOKENS_TOTAL`
- `TOKENS_24H`
- `TOKENS_7D`
- optional `TOKENS_SOURCE_LABEL` (default: `manual`)

### 2) HTTP JSON mode (optional)
Set:
- `TOKENS_SOURCE_MODE=http-json`
- `TOKENS_SOURCE_ENDPOINT=https://...`
- optional `TOKENS_SOURCE_TOKEN` (if endpoint requires bearer token)
- optional `TOKENS_SOURCE_LABEL` (default: `http-json`)

Expected endpoint payload fields:
- `tokens_total`
- `tokens_24h`
- `tokens_7d`

## Landing integration
Landing repository reads this file via GitHub API/raw URL using:
- `TOKENS_REPO_OWNER`
- `TOKENS_REPO_NAME`
- `TOKENS_FILE_PATH` (default `public/data/tokens.json`)
- optional `TOKENS_FILE_REF` (default `main`)

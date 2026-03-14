# Design Tokens

`design/tokens.json` is the single source of truth for cross-platform style tokens.

## Token domains

- `colors`: semantic palette from landing CSS variables (`background`, `foreground`, `muted`, `muted-foreground`, `popover`, `popover-foreground`, `card`, `card-foreground`, `border`, `input`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `accent`, `accent-foreground`, `destructive`, `destructive-foreground`, `ring`)
- `radii`: radius variables (`radius`)
- `spacing`: spacing scale
- `typography`: `font_sans`, `font_mono`, optional `font_metric_mono`, and size scale

## Generation

Deterministic generation is handled by Rust tool:

```bash
cargo run -p design-token-gen
```

Generated files:

- Web:
  - `packages/ui-web/tailwind.tokens.css`
  - `packages/ui-web/tokens.ts`
- Android:
  - `mobile/android/app/src/main/java/com/animus/link/ui/Theme.kt`
- iOS:
  - `mobile/ios/AnimusLinkIOS/Theme.swift`

## Platform scripts

Requested platform scripts are kept under `scripts/`:

- `scripts/gen-tokens-web.ts`
- `scripts/gen-tokens-android.kt`
- `scripts/gen-tokens-ios.swift`

CI drift gate uses `design-token-gen` and fails on `git diff --exit-code` if generated outputs are stale.

## Style parity proof

Canonical token values are extracted from:

- `frontend_landing/styles/globals.css` (`:root` CSS variables)
- `frontend_landing/tailwind.config.ts` (semantic mapping validation)

Re-extract workflow on landing updates:

```bash
unzip -o /mnt/data/frontend_landing.zip -d /tmp/frontend_landing
cargo run -p design-token-gen
```

The CI drift gate enforces parity by regenerating and requiring a clean diff for:

- `design/tokens.json`
- `packages/ui-web/tailwind.tokens.css`
- `packages/ui-web/tokens.ts`
- `mobile/android/app/src/main/java/com/animus/link/ui/Theme.kt`
- `mobile/ios/AnimusLinkIOS/Theme.swift`

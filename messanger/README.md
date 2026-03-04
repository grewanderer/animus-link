# Animus Link Web App

Web application for Animus Link network. Primary product in this app is the `Link` messenger.

## Tech Stack

- Next.js 15 (App Router)
- React 18 + TypeScript
- Tailwind CSS

Node version is pinned in `.nvmrc` (20.18.1).
The repo enforces this via `package.json` engines and `.npmrc` (`engine-strict=true`).

## Project Structure

- `app/` – routes, layouts, API (`/api/messenger`)
- `components/` – reusable UI + frame rendering
- `components/messenger/` – React messenger client
- `sections/landing/` – landing-specific sections and blocks
- `styles/` – global styles
- `lib/` – utilities (i18n, seo, contact, helpers, messenger runtime)
- `config/` – site configuration
- `public/` – static assets (favicons, logo)
- `scripts/` – maintenance scripts

## Environment Setup

Copy `.env.example` and create environment-specific files as needed:

- `.env.local` for local development
- `.env.staging` for staging
- `.env.production` for production

Build-time variables (required for `npm run build`):

- `NEXT_PUBLIC_SITE_URL` – public base URL used for metadata/canonicals

Runtime variables (required for `npm run start`):

- `NEXT_PUBLIC_SITE_URL`

Environment validation is enforced via `scripts/validate-env.mjs` and will exit on misconfiguration.

## Local Development

```bash
nvm use
npm install
npm run dev
```

Open `http://localhost:3000` (redirects to `/{defaultLocale}`).
`npm run dev` validates required env vars before booting.

## Build & Run

```bash
npm run build
npm run start
```

`NEXT_PUBLIC_SITE_URL` must be present at build time and runtime. No defaults are applied.

## Deployment

### Docker (recommended)

Build (uses build-time `NEXT_PUBLIC_SITE_URL`):

```bash
docker build -t animus-landing \
  --build-arg NEXT_PUBLIC_SITE_URL=https://example.com .
```

Run (runtime envs via `.env.production`):

```bash
docker run -d \
  --name animus-landing \
  -p 3000:3000 \
  --env-file .env.production \
  animus-landing
```

Docker Compose (see `deploy/docker-compose.yml`):

```bash
NEXT_PUBLIC_SITE_URL=https://example.com docker compose -f deploy/docker-compose.yml up -d --build
```

### Bare-metal Node.js + systemd

1) Install Node.js 20.18.1 and create `.env.production` on the server.
2) Install dependencies and build:

```bash
nvm install 20.18.1
nvm use 20.18.1
npm ci
NEXT_PUBLIC_SITE_URL=https://example.com npm run build
```

3) Install the systemd unit from `deploy/systemd/animus-landing.service`, adjust `WorkingDirectory`, `User`, and `EnvironmentFile` paths, then enable it:

```bash
sudo cp deploy/systemd/animus-landing.service /etc/systemd/system/animus-landing.service
sudo systemctl daemon-reload
sudo systemctl enable --now animus-landing
```

Ensure Node 20.18.1 is available on the systemd service PATH (or replace `/usr/bin/env node` with an absolute Node path).

## Commands

- `npm run lint` – ESLint
- `npm run format` – Prettier
- `npm run typecheck` – TypeScript checks
- `npm run clean` – remove build artifacts

## Routing & Localization

- Routes are locale-scoped under `/{locale}` (see `lib/i18n.ts`).
- `/` redirects to the default locale.
- Unknown locales return 404.

## SEO & Metadata

Centralized in `config/site.ts` and `lib/seo.ts`:

- base metadata (title/description/icons)
- canonical + language alternates
- OpenGraph + Twitter

## Link Messenger (React + Node runtime)

- UI route: `/link` (also `/l/{locale}/link`, legacy route `/messenger` is still available)
- React client: `components/messenger/messenger-app.tsx`
- Node backend/API: `app/api/messenger/route.ts`
- Runtime state and networking: `lib/messenger/runtime.ts`

Link backend integrates with local `link-daemon` endpoints:
- `POST /v1/invite/create`
- `POST /v1/invite/join`
- `POST /v1/expose`
- `POST /v1/connect`

Optional env:
- `ANIMUS_MESSENGER_STATE_FILE` — overrides persisted state path (default `.animus-link/messenger-web/state.json`).

## Common Issues

- **Build or start fails**: required envs missing (see `.env.example`).
- **Wrong canonical/OG URLs**: ensure `NEXT_PUBLIC_SITE_URL` is set at build time.
- **Build points to localhost in production**: set `NEXT_PUBLIC_SITE_URL=https://kapakka.org` for build and runtime. `scripts/validate-env.mjs` now rejects localhost values in production unless `ALLOW_LOCALHOST_SITE_URL=1` is explicitly set.

## Maintenance Notes

- Update web app copy in `app/[locale]/page.tsx`.
- Update nav/hero data in `lib/marketing-data.ts`.
- Update SEO defaults in `config/site.ts` and `lib/seo.ts`.
- Update assets in `public/` (favicons, logo).

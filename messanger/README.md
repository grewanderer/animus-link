# Animus Link Web App

Web application for Animus Link network. Primary product in this app is the `Link` messenger.

## Tech Stack

- Next.js 15 (App Router)
- React 18 + TypeScript
- Tailwind CSS
- Node.js runtime for API route `/api/messenger`

Node and npm versions are pinned and enforced:

- Node `20.18.1`
- npm `10.9.0`
- `engine-strict=true` is enabled, so other versions are rejected by `npm ci`.

## Messenger Overview

- UI route: `/link` (legacy route `/messenger` is also available)
- React client: `components/messenger/messenger-app.tsx`
- Node backend/API: `app/api/messenger/route.ts`
- Runtime state and networking: `lib/messenger/runtime.ts`

Backend actions use local `link-daemon` HTTP API:

- `POST /v1/invite/create`
- `POST /v1/invite/join`
- `POST /v1/expose`
- `POST /v1/connect`

Optional env:

- `ANIMUS_MESSENGER_STATE_FILE` (default `.animus-link/messenger-web/state.json`)
- `NEXT_PUBLIC_MESSENGER_ADVANCED_UI=1` enables advanced fields (`Daemon API`, service name inputs)
- `NEXT_PUBLIC_MESSENGER_DEV_UI=1` enables developer fields (`listen address`, `allowed peers`, `SSH Terminal`) and also turns on advanced fields

## Prerequisites

### Required for web app only

- Node `20.18.1`
- npm `10.9.0`

### Required for full messenger networking (relay + daemon)

- Rust toolchain (`rustup`, `cargo`)
- Visual C++ Build Tools (Windows, MSVC linker `link.exe`)
  - Install workload: `Desktop development with C++`

Without the MSVC linker, all `cargo build/run` commands fail with:
`error: linker 'link.exe' not found`.

## Environment Setup

Create `.env.local` (or `.env`) in `messanger/` with at least:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`scripts/validate-env.mjs` checks this variable on `dev/build/start`.

## Run Modes

### Mode A: UI only (no relay/daemon)

Use this mode to run and develop UI locally.

```powershell
cd C:\Users\Red\Desktop\animus-link\messanger
npm.cmd ci
$env:NEXT_PUBLIC_SITE_URL="http://localhost:3000"
npm.cmd run dev
```

Open `http://localhost:3000/link`.

In this mode, invite/host/join actions will fail until `link-daemon` is running.

### Mode B: Full local messenger (2 peers over local relay)

Run from repo root `C:\Users\Red\Desktop\animus-link`.

1. Terminal 1: start relay

```powershell
cargo run -p relay-server -- --bind 127.0.0.1:7777 --token-issuer-pubkey-hex d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a
```

2. Terminal 2: start daemon A

```powershell
cargo run -p link-daemon -- --api-bind 127.0.0.1:9999 --state-file .animus-link/state/a.json --relay-addr 127.0.0.1:7777 --relay-name default-relay --relay-token-signing-seed-hex 9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60
```

3. Terminal 3: start daemon B

```powershell
cargo run -p link-daemon -- --api-bind 127.0.0.1:10000 --state-file .animus-link/state/b.json --relay-addr 127.0.0.1:7777 --relay-name default-relay --relay-token-signing-seed-hex 9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60
```

4. Terminal 4: start web app

```powershell
cd C:\Users\Red\Desktop\animus-link\messanger
npm.cmd ci
$env:NEXT_PUBLIC_SITE_URL="http://localhost:3000"
$env:NEXT_PUBLIC_MESSENGER_ADVANCED_UI="1"
npm.cmd run dev
```

5. Open two clients:

- Browser window A: `http://localhost:3000/link` with `Daemon API = http://127.0.0.1:9999`
- Browser window B: `http://localhost:3000/link` with `Daemon API = http://127.0.0.1:10000`

6. Chat flow:

- In A: `Create Invite`
- In B: paste invite and click `Join Invite`
- In A: `Start Host`
- In B: `Join Room`
- Send messages both ways

## How To Use The App

After opening `http://localhost:3000/link`, the page is split into:

- Left: profile, invite controls, rooms list
- Right: selected room settings, connection actions, message timeline, composer
- Bottom-right in `dev` mode: `SSH Terminal` event log panel

Top bar also has a `Dark Theme` / `Light Theme` toggle.

UI modes:

- Default: end-user mode, only core chat controls are visible
- `NEXT_PUBLIC_MESSENGER_ADVANCED_UI=1`: shows advanced configuration (`Daemon API`, `service name`)
- `NEXT_PUBLIC_MESSENGER_DEV_UI=1`: shows developer networking tools (`listen address`, `allowed peers`, `SSH Terminal`)

### Main fields

- `Profile`: your display name in chat messages.
- `Avatar`: optional profile image (`Avatar` / `Remove`).
  - Supported formats: PNG/JPG/WEBP/GIF.
  - Max local upload size: 192 KB.
- `Daemon API`: local Link daemon endpoint for this browser session.
  - Example A: `http://127.0.0.1:9999`
  - Example B: `http://127.0.0.1:10000`
  - Visible in `advanced` / `dev` mode.
- `Invite`: invite string used to pair peers (`Create Invite` / `Join Invite`).
- Room settings:
  - `Room title`: UI label.
  - `Service name`: network service id used by daemon `expose/connect`.
    - Visible in `advanced` / `dev` mode.
  - `Listen address`: host-side local TCP bind, for example `127.0.0.1:19180`.
    - Visible only in `dev` mode.
  - `Allowed peers CSV`: comma-separated peer ids allowed to connect.
    - Visible only in `dev` mode.

### Typical 1-to-1 flow

1. In browser A, set `Daemon API` to daemon A and click `Create Invite`.
2. Copy invite text to browser B.
3. In browser B, set `Daemon API` to daemon B, paste invite, click `Join Invite`.
4. In browser A, choose room and click `Start Host`.
5. In browser B, choose same room/service and click `Join Room`.
6. Wait for status badge:
   - A: `HOST`
   - B: `JOINED`
7. Type message in the bottom textarea and click `Send`.
8. If you changed avatar/profile, open `Edit Profile` and click `Save` before invite/join.
9. If you changed room title/service/listen/allowed peers fields, click `Save Room` before host/join.

### Rooms

- `Add Room`: creates local room config/history.
- `Edit Profile`: opens inline profile editor in the upper-left card.
- `Save API`: persists `Daemon API` in advanced/dev mode.
- `Save Room`: persists selected room settings.
- `Delete`: removes selected room and local history (at least one room must remain).
- `Disconnect`: closes current host/join connection for selected room.

### Message timeline

- `system` messages show connection events (`joined`, `left`, `connection closed`).
- Outgoing messages are styled differently from incoming.
- Message list auto-refreshes periodically.
- If room is disconnected, the message area shows a join notice (`Join the room to see messages.`).
- Lower `SSH Terminal` panel shows API/network events and recent warnings/errors.
  - Visible only in `dev` mode.

### Local persistence

- UI settings and room history are persisted to:
  - default: `.animus-link/messenger-web/state.json`
  - override: `ANIMUS_MESSENGER_STATE_FILE`

### Important behavior

- One active runtime connection is expected at a time.
- If daemon is unreachable, invite/host/join actions return API errors in the UI.
- `Start Host` calls daemon `expose`; `Join Room` calls daemon `connect`.

## Windows Notes

### PowerShell blocks `npm.ps1`

If you see `running scripts is disabled`, use one of:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

or run npm via `.cmd`:

```powershell
npm.cmd ci
```

### `EBADENGINE` on `npm ci`

This means active Node/npm versions do not match required versions.

Check:

```powershell
node -v
npm.cmd -v
```

Must be exactly:

- `v20.18.1`
- `10.9.0`

## Build & Run (production)

```bash
npm run build
npm run start
```

`NEXT_PUBLIC_SITE_URL` is required at build and runtime.

## Docker

Build:

```bash
docker build -t animus-landing --build-arg NEXT_PUBLIC_SITE_URL=https://example.com .
```

Run:

```bash
docker run -d --name animus-landing -p 3000:3000 --env-file .env.production animus-landing
```

Compose:

```bash
NEXT_PUBLIC_SITE_URL=https://example.com docker compose -f deploy/docker-compose.yml up -d --build
```

## Commands

- `npm run lint` - ESLint
- `npm run typecheck` - TypeScript checks
- `npm run format` - Prettier
- `npm run clean` - remove build artifacts
- `npm test` - tests

## Common Issues

- Build/start fails: required env vars are missing (`NEXT_PUBLIC_SITE_URL`).
- `/api/messenger` errors about daemon: `link-daemon` is not running or `Daemon API` URL is wrong.
- Cargo commands fail with `link.exe` missing: install Visual C++ Build Tools.
- Production build rejects localhost URL: set real domain for `NEXT_PUBLIC_SITE_URL`, or set `ALLOW_LOCALHOST_SITE_URL=1` for explicit local override.

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

Backend actions use local `link-daemon` HTTP API. The runtime prefers mesh-aware service endpoints from the updated core and falls back to legacy invite/expose/connect when mesh bootstrap is not available yet:

- `GET /v1/meshes`
- `POST /v1/meshes`
- `POST /v1/meshes/join`
- `POST /v1/meshes/{mesh_id}/sync`
- `POST /v1/services/expose`
- `POST /v1/services/connect`
- `POST /v1/invite/create`
- `POST /v1/invite/join`
- `POST /v1/expose`
- `POST /v1/connect`

Optional env:

- `ANIMUS_MESSENGER_STATE_FILE` (default `.animus-link/messenger-web/state.json`)
- `ANIMUS_MESSENGER_BOOTSTRAP_URL` appends `#bootstrap=...` to generated invites and lets the messenger push/pull mesh state through the public bootstrap daemon API
- `NEXT_PUBLIC_MESSENGER_AUTO_ROOM_FLOW=1` hides manual room-connect controls in the end-user UI and enables the automatic invite flow messaging
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

### Mode C: Realistic remote test (2 different computers via VPS relay + bootstrap daemon)

Use this mode when you want to test with another person over the internet without requiring a public IP on either client machine.

Architecture:

- VPS runs `relay-server`
- VPS also runs one public `link-daemon` used only for mesh bootstrap/sync
- your machine runs local `link-daemon` + `messanger`
- friend machine runs local `link-daemon` + `messanger`

This stays close to the intended product shape (one daemon per user), but removes the home-network bootstrap problem.

#### Step 1: start relay on VPS with Docker

On the VPS create relay env if it does not exist:

```bash
cd /opt/animus-link
mkdir -p deploy
cat > deploy/.env.relay <<'EOF'
ANIMUS_RELAY_NAME=default-relay
ANIMUS_RELAY_TOKEN_ISSUER_PUBKEY_HEX=d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a
ANIMUS_RELAY_MAX_ALLOC_PER_ISSUER=256
ANIMUS_RELAY_MAX_ALLOC_PER_SUBJECT=64
ANIMUS_RELAY_MAX_BINDINGS_PER_ALLOC=16
ANIMUS_RELAY_MAX_TOKEN_PAYLOAD_BYTES=1024
ANIMUS_RELAY_MAX_PACKET_SIZE_BYTES=2048
EOF
```

Start relay:

```bash
docker compose --env-file deploy/.env.relay -f deploy/docker-compose.yml up -d --build
docker compose --env-file deploy/.env.relay -f deploy/docker-compose.yml ps
docker compose --env-file deploy/.env.relay -f deploy/docker-compose.yml logs -f relay
```

Stop / restart relay:

```bash
docker compose --env-file deploy/.env.relay -f deploy/docker-compose.yml down
docker compose --env-file deploy/.env.relay -f deploy/docker-compose.yml up -d --build
```

Open `UDP 7777` in the VPS firewall/security group.

Current VPS relay address used by the project setup:

```text
45.12.70.107:7777
```

#### Step 2: start public bootstrap daemon on VPS

Quick run:

```bash
cd /opt/animus-link
cargo run -p link-daemon -- --api-bind 0.0.0.0:9999 --state-file .animus-link/state/bootstrap.json --relay-addr 127.0.0.1:7777 --relay-name default-relay --relay-token-signing-seed-hex 9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60
```

If you want it as a service:

- unit: `deploy/systemd/animus-link-bootstrap.service`
- env example: `deploy/systemd/animus-link-bootstrap.env.example`

Useful systemd commands:

```bash
sudo systemctl stop animus-link-bootstrap
sudo systemctl start animus-link-bootstrap
sudo systemctl restart animus-link-bootstrap
sudo systemctl status animus-link-bootstrap
journalctl -u animus-link-bootstrap -f
```

Open `TCP 9999` in the VPS firewall/security group.

Current VPS bootstrap daemon URL used by the project setup:

```text
http://45.12.70.107:9999
```

Important:

- `bootstrap_url` must be exactly `http://host:port`
- valid example: `http://45.12.70.107:9999`
- invalid examples:
  - `45.12.70.107:9999`
  - `https://45.12.70.107:9999`
  - `http://45.12.70.107:9999/v1/health`

#### Step 3: start the client on each local machine

Fastest local start: run one PowerShell script per user.

Your machine:

```powershell
cd C:\Users\Red\Desktop\animus-link
powershell -ExecutionPolicy Bypass -File .\messanger\scripts\start-client.ps1 -StateName a
```

Friend machine:

```powershell
cd C:\Users\Friend\Desktop\animus-link
powershell -ExecutionPolicy Bypass -File .\messanger\scripts\start-client.ps1 -StateName b
```

What the script does:

- starts local `link-daemon` on `127.0.0.1:9999`
- points it to VPS relay `45.12.70.107:7777`
- configures messenger bootstrap URL as `http://45.12.70.107:9999`
- enables automatic invite flow (`Create Invite` -> auto host, `Join Invite` -> auto join)
- launches web messenger on `http://localhost:3000/link`

Optional script modes:

```powershell
powershell -ExecutionPolicy Bypass -File .\messanger\scripts\start-client.ps1 -StateName a -UiMode advanced
powershell -ExecutionPolicy Bypass -File .\messanger\scripts\start-client.ps1 -StateName a -UiMode dev
```

Manual commands are still available if you need them for debugging:

Your machine daemon:

Terminal 1, daemon:

```powershell
cd C:\Users\Red\Desktop\animus-link
cargo run -p link-daemon -- --api-bind 127.0.0.1:9999 --state-file .animus-link/state/a.json --relay-addr 45.12.70.107:7777 --relay-name default-relay --relay-token-signing-seed-hex 9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60
```

Terminal 2, web:

```powershell
cd C:\Users\Red\Desktop\animus-link\messanger
npm.cmd ci
$env:ANIMUS_MESSENGER_STATE_FILE=".animus-link/messenger-web/a.json"
$env:ANIMUS_MESSENGER_BOOTSTRAP_URL="http://45.12.70.107:9999"
$env:NEXT_PUBLIC_MESSENGER_AUTO_ROOM_FLOW="1"
$env:NEXT_PUBLIC_SITE_URL="http://localhost:3000"
npm.cmd run dev
```

Open:

```text
http://localhost:3000/link
```

Set:

```text
Daemon API = http://127.0.0.1:9999
```

Friend machine daemon:

Terminal 1, daemon:

```powershell
cd C:\Users\Friend\Desktop\animus-link
cargo run -p link-daemon -- --api-bind 127.0.0.1:9999 --state-file .animus-link/state/b.json --relay-addr 45.12.70.107:7777 --relay-name default-relay --relay-token-signing-seed-hex 9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60
```

Terminal 2, web:

```powershell
cd C:\Users\Friend\Desktop\animus-link\messanger
npm.cmd ci
$env:ANIMUS_MESSENGER_STATE_FILE=".animus-link/messenger-web/b.json"
$env:ANIMUS_MESSENGER_BOOTSTRAP_URL="http://45.12.70.107:9999"
$env:NEXT_PUBLIC_MESSENGER_AUTO_ROOM_FLOW="1"
$env:NEXT_PUBLIC_SITE_URL="http://localhost:3000"
npm.cmd run dev
```

Open:

```text
http://localhost:3000/link
```

Set:

```text
Daemon API = http://127.0.0.1:9999
```

#### Step 4: chat flow

1. On your machine: open the app and choose the target room
2. Click `Create Invite`
3. Confirm the invite string contains `#bootstrap=` at the end
4. Send the full invite string to your friend
5. On friend machine: open the app, choose the target room, paste the invite into `Invite code`, and click `Join Invite`
6. Wait a few seconds while the app automatically:
   - syncs mesh state through VPS bootstrap daemon
   - starts hosting on the inviter side
   - connects on the joiner side
7. Send messages in both directions

In the end-user flow you no longer need to click `Start Host` or `Join Room`.
Those controls remain available only in `advanced` / `dev` mode.

#### Step 5: quick checks if connection fails

On each machine:

```powershell
curl http://127.0.0.1:9999/v1/health
```

On the VPS:

```bash
docker compose --env-file deploy/.env.relay -f deploy/docker-compose.yml ps
docker compose --env-file deploy/.env.relay -f deploy/docker-compose.yml logs --tail=100 relay
curl http://127.0.0.1:9999/v1/health
```

Extra checks:

- For live relay traffic debugging:

```bash
sudo tcpdump -ni any udp port 7777
```

- If `Create Invite` does not append `#bootstrap=`, verify `ANIMUS_MESSENGER_BOOTSTRAP_URL` is set before `npm.cmd run dev`.
- If room join stalls in `CONNECTING`, the host runtime now tries to replace placeholder `allowed peers` value `peer-b` with known mesh peer ids automatically. If that still does not happen, open `dev` mode and set the real second peer id manually, then click `Save Room` and retry the invite flow.

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
4. If `NEXT_PUBLIC_MESSENGER_AUTO_ROOM_FLOW=1` is enabled, wait a few seconds for automatic host/join.
5. If auto room flow is disabled, use manual room controls:
   - A: `Start Host`
   - B: `Join Room`
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
- `Start Host` / `Join Room`: visible in `advanced` / `dev` mode or when auto room flow is disabled.

### Message timeline

- Outgoing messages are styled differently from incoming.
- Message list auto-refreshes periodically.
- If auto room flow is enabled, the message area shows waiting hints while host/join is resolving in the background.
- Lower `SSH Terminal` panel shows API/network events and recent warnings/errors.
  - Visible only in `dev` mode.

### Local persistence

- UI settings and room history are persisted to:
  - default: `.animus-link/messenger-web/state.json`
  - override: `ANIMUS_MESSENGER_STATE_FILE`

### Important behavior

- One active runtime connection is expected at a time.
- If daemon is unreachable, invite/host/join actions return API errors in the UI.
- `Create Invite` always creates an invite for the active room.
- With VPS bootstrap enabled, `Create Invite` marks the room for automatic host startup.
- `Join Invite` accepts the invite and, with VPS bootstrap enabled, marks the room for automatic join.
- Automatic room flow is driven by the snapshot poll loop: the runtime keeps reconciling mesh state with the public bootstrap daemon until host/join succeeds.
- `Start Host` still calls daemon `expose`; `Join Room` still calls daemon `connect`, but in the normal VPS flow they are fallback/debug controls rather than the main user path.

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

### Web app container

Build:

```bash
docker build -t animus-landing --build-arg NEXT_PUBLIC_SITE_URL=https://example.com .
```

Run:

```bash
docker run -d --name animus-landing -p 3000:3000 --env-file .env.production animus-landing
```

### Relay container for VPS testing

For real messenger testing across different computers, run `relay-server` on the VPS and keep the web app local on each user machine.

On the VPS:

```bash
cp deploy/.env.relay.example deploy/.env.relay
docker compose --env-file deploy/.env.relay -f deploy/docker-compose.yml up -d --build
```

Open `UDP 7777` in the VPS firewall/security group.

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

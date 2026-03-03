# Animus Link Messenger GUI (Python)

Desktop messenger application for users in Animus Link network.

The app uses existing `link-daemon` API:
- `POST /v1/invite/create`
- `POST /v1/invite/join`
- `POST /v1/expose`
- `POST /v1/connect`

No Fabric wire/protocol changes are required.

## Features (current foundation)

- Multiple rooms (conversation list)
- Per-room local message history
- Persistent local state (`--state-file`)
- Invite create/join
- Host selected room (`/v1/expose`)
- Join selected room (`/v1/connect`)
- Per-room connection status and reconnect workflow

## Run

Install dependency:

```bash
pip install -r apps/chat-gui-python/requirements.txt
```

Then run:

```bash
python3 apps/chat-gui-python/chat_gui.py \
  --daemon-api http://127.0.0.1:9999 \
  --state-file .animus-link/chat/state.json
```

## Manual test with 2 users

Prerequisites:
- relay is running
- two daemons are running on different API ports, for example:
  - daemon A: `http://127.0.0.1:9999`
  - daemon B: `http://127.0.0.1:10000`

### 1) User A (host side)

1. Launch GUI pointing to daemon A.
2. Create/select room in left panel.
3. Configure room `Service`, `Listen`, `Allowed peers (csv)`.
4. Click `Create Invite`.
5. Copy invite string and send to user B.
6. Click `Start Host`.

### 2) User B (join side)

1. Launch GUI pointing to daemon B.
2. Create/select room with matching `Service`.
3. Paste invite and click `Join Invite`.
4. Click `Join Room`.

### 3) Exchange messages

- Both sides type messages and click `Send`.
- History is persisted in local state file.
- `Disconnect` ends current room connection.

## Notes

- GUI is built with `PySide6` (Qt).
- This is a foundation for a full messenger UX, with MVP transport semantics.

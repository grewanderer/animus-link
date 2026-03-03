# Animus Link Chat GUI (Python)

Desktop chat application for users in Animus Link network.

The app uses existing `link-daemon` API:
- `POST /v1/invite/create`
- `POST /v1/invite/join`
- `POST /v1/expose`
- `POST /v1/connect`

No Fabric wire/protocol changes are required.

## Run

Install dependency:

```bash
pip install -r apps/chat-gui-python/requirements.txt
```

Then run:

```bash
python3 apps/chat-gui-python/chat_gui.py --daemon-api http://127.0.0.1:9999
```

## Manual test with 2 users

Prerequisites:
- relay is running
- two daemons are running on different API ports, for example:
  - daemon A: `http://127.0.0.1:9999`
  - daemon B: `http://127.0.0.1:10000`

### 1) User A (host side)

1. Launch GUI pointing to daemon A.
2. Click `Create Invite`.
3. Copy invite string from `Invite` field and send to user B.
4. Fill `Allowed peers (csv)` with peer IDs allowed to connect (for MVP, set what your daemon expects, e.g. `peer-b`).
5. Click `Start Host`.

### 2) User B (join side)

1. Launch GUI pointing to daemon B.
2. Paste invite and click `Join Invite`.
3. Click `Join Chat`.

### 3) Exchange messages

- Both sides type messages in input box and click `Send`.
- `Disconnect` ends current host/join session.

## Notes

- GUI is built with `PySide6` (Qt).
- This is MVP chat transport and not production message persistence.

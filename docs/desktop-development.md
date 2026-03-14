# Desktop Development

`apps/link-desktop/` is the new desktop shell for Animus Link. It uses:

- Tauri 2 for the desktop host
- React + TypeScript + Vite for the UI
- the existing `link-daemon` as a supervised sidecar

## Local workflow

1. Build the daemon once:
   `cargo build -p link-daemon`
2. Install frontend dependencies:
   `cd apps/link-desktop && npm install`
3. Generate desktop icons from the committed SVG source:
   `npm exec tauri icon src/assets/app-icon.svg`
4. Start the desktop shell in dev mode:
   `npm run tauri:dev`

The desktop shell will try the following daemon binary sources in order:

1. `dev_daemon_binary_path` from desktop preferences
2. `target/debug/link-daemon` or `target/release/link-daemon` in the workspace
3. the bundled sidecar copied into `src-tauri/bin/` for release packaging

## Supported platforms

- macOS
- Windows
- Linux

The desktop UI is intentionally a shell over the daemon. Meshes, peers, relay policy, routing, services, and messenger state remain in `link-daemon`.

## Known limitations

- Messenger attachments remain deferred.
- Desktop "device label" is local shell metadata; the current daemon control-plane model does not persist a user-facing device-name field.
- Per-service byte counters are not yet exposed by the daemon. The desktop surface currently shows global proxy volume and binding state.
- Updater actions are wired through desktop settings and CI configuration, but live updater distribution still depends on release signing secrets and hosted endpoints.

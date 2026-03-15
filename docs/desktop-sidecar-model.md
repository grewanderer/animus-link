# Desktop Sidecar Model

Animus Link Desktop does not embed mesh logic in the frontend or the Tauri backend.

## Source of truth

`link-daemon` remains authoritative for:

- identity
- meshes
- peers
- node roles
- relay policy
- routing decisions
- services
- messenger runtime and state

The desktop app is an operator shell that:

- starts and supervises `link-daemon`
- surfaces daemon health and diagnostics
- reads and writes desktop-only preferences
- opens OS paths and exposes tray actions

## Runtime behavior

- The app starts the sidecar automatically on launch.
- The app polls daemon health and emits small status-change events to the frontend.
- The tray exposes open, restart-daemon, show-status, and quit actions.
- Closing the main window can hide to tray when the desktop preference is enabled.
- Sidecar stdout/stderr is appended to the desktop log directory.

## Paths

The desktop backend exposes:

- config dir
- data dir
- cache dir
- log dir
- desktop state file
- daemon state file
- daemon log file

Desktop-state reset clears only local shell state and preferences. It must not delete daemon mesh state.

## Troubleshooting

If the sidecar does not start:

- verify `cargo build -p link-daemon` succeeds
- verify `apps/link-desktop/src-tauri/bin/` contains a prepared sidecar for release builds
- check the daemon log from the desktop diagnostics page or log directory
- confirm the selected API bind port is not blocked by local policy software

If Linux packaging fails:

- install WebKitGTK and Ayatana AppIndicator development packages
- confirm the target system has `libwebkit2gtk-4.1` compatible runtime libraries

If macOS or Windows builds start unsigned:

- confirm the relevant signing secrets are present in GitHub Actions
- unsigned preview artifacts are expected fallback output when secrets are absent

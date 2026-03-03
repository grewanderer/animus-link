#!/usr/bin/env python3
"""
Animus Link Chat GUI (MVP)

Desktop chat app built on top of existing link-daemon API.
"""

from __future__ import annotations

import argparse
import json
import socket
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable, Dict, Optional, Tuple

try:
    from PySide6.QtCore import QObject, Qt, Signal
    from PySide6.QtGui import QAction, QKeySequence
    from PySide6.QtWidgets import (
        QApplication,
        QFrame,
        QGridLayout,
        QHBoxLayout,
        QLabel,
        QLineEdit,
        QMainWindow,
        QMessageBox,
        QPushButton,
        QPlainTextEdit,
        QSplitter,
        QVBoxLayout,
        QWidget,
    )
except ImportError as error:
    raise SystemExit(
        "PySide6 is required. Install with: pip install PySide6"
    ) from error


MAX_LINE_BYTES = 4096
MAX_TEXT_LEN = 1024
MAX_NAME_LEN = 32


class AppError(Exception):
    pass


def now_hms() -> str:
    return time.strftime("%H:%M:%S", time.localtime())


def sanitize_name(name: str) -> str:
    clean = "".join(ch for ch in name.strip() if ch.isalnum() or ch in "-_.")
    if not clean:
        clean = "anon"
    return clean[:MAX_NAME_LEN]


def sanitize_text(text: str) -> Optional[str]:
    clean = text.replace("\r", "").replace("\n", "").strip()
    if not clean:
        return None
    return clean[:MAX_TEXT_LEN]


def parse_host_port(value: str) -> Tuple[str, int]:
    if ":" not in value:
        raise AppError(f"invalid address: {value}")
    host, port_raw = value.rsplit(":", 1)
    host = host.strip().strip("[]")
    try:
        port = int(port_raw)
    except ValueError as error:
        raise AppError(f"invalid port: {value}") from error
    if not host or port < 1 or port > 65535:
        raise AppError(f"invalid address: {value}")
    return host, port


class UiSignals(QObject):
    chat_line = Signal(str, str)
    status = Signal(str)
    error = Signal(str, str)


class DaemonApi:
    def __init__(self, api_base: str):
        self.api_base = api_base.rstrip("/")

    def post(self, path: str, payload: Optional[dict]) -> dict:
        data = b""
        headers = {}
        if payload is not None:
            data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            url=f"{self.api_base}{path}",
            data=data,
            method="POST",
            headers=headers,
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                parsed = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            raw = error.read()
            try:
                parsed = json.loads(raw.decode("utf-8"))
            except Exception:
                raise AppError(f"daemon HTTP error: {error.code}") from error
            if isinstance(parsed, dict) and isinstance(parsed.get("error"), dict):
                code = parsed["error"].get("code", "unknown")
                message = parsed["error"].get("message", "unknown error")
                raise AppError(
                    f"daemon HTTP error: {error.code}: {code}: {message}"
                ) from error
            raise AppError(f"daemon HTTP error: {error.code}") from error
        except urllib.error.URLError as error:
            raise AppError(f"cannot reach daemon API: {self.api_base}") from error
        except Exception as error:
            raise AppError("invalid daemon response") from error

        if not isinstance(parsed, dict):
            raise AppError("invalid daemon response envelope")
        if isinstance(parsed.get("error"), dict):
            code = parsed["error"].get("code", "unknown")
            message = parsed["error"].get("message", "unknown error")
            raise AppError(f"daemon error: {code}: {message}")
        return parsed


@dataclass
class Peer:
    conn: socket.socket
    name: str


class ChatServer:
    def __init__(self, listen_addr: str, on_message: Callable[[str, str], None]):
        host, port = parse_host_port(listen_addr)
        self._listener = socket.create_server((host, port), reuse_port=False)
        self._listener.settimeout(1.0)
        self._on_message = on_message
        self._stop = threading.Event()
        self._peers: Dict[socket.socket, Peer] = {}
        self._lock = threading.Lock()
        self._accept_thread: Optional[threading.Thread] = None

    @property
    def listen_addr(self) -> str:
        host, port = self._listener.getsockname()
        return f"{host}:{port}"

    def start(self) -> None:
        self._accept_thread = threading.Thread(target=self._accept_loop, daemon=True)
        self._accept_thread.start()

    def stop(self) -> None:
        self._stop.set()
        try:
            self._listener.close()
        except OSError:
            pass
        with self._lock:
            peers = list(self._peers.values())
            self._peers.clear()
        for peer in peers:
            try:
                peer.conn.close()
            except OSError:
                pass
        if self._accept_thread is not None:
            self._accept_thread.join(timeout=1.0)

    def send_local_message(self, sender: str, text: str) -> None:
        text = sanitize_text(text)
        if not text:
            return
        sender = sanitize_name(sender)
        self._broadcast_chat(sender, text)

    def _accept_loop(self) -> None:
        while not self._stop.is_set():
            try:
                conn, _ = self._listener.accept()
            except socket.timeout:
                continue
            except OSError:
                if self._stop.is_set():
                    return
                continue
            threading.Thread(target=self._handle_client, args=(conn,), daemon=True).start()

    def _handle_client(self, conn: socket.socket) -> None:
        joined = False
        peer_name = "anon"
        try:
            reader = conn.makefile("rb")
            while not self._stop.is_set():
                raw = reader.readline(MAX_LINE_BYTES + 1)
                if not raw:
                    break
                if len(raw) > MAX_LINE_BYTES:
                    break
                try:
                    payload = json.loads(raw.decode("utf-8"))
                except Exception:
                    continue
                if not isinstance(payload, dict):
                    continue
                kind = payload.get("type")
                if kind == "join":
                    peer_name = sanitize_name(str(payload.get("name", "anon")))
                    if not joined:
                        joined = True
                        with self._lock:
                            self._peers[conn] = Peer(conn=conn, name=peer_name)
                        self._broadcast_system(f"{peer_name} joined")
                    continue
                if kind == "chat" and joined:
                    text = sanitize_text(str(payload.get("text", "")))
                    if text:
                        self._broadcast_chat(peer_name, text)
        except OSError:
            pass
        finally:
            with self._lock:
                peer = self._peers.pop(conn, None)
            try:
                conn.close()
            except OSError:
                pass
            if peer is not None:
                self._broadcast_system(f"{peer.name} left")

    def _broadcast_system(self, text: str) -> None:
        self._on_message("system", text)
        self._broadcast({"type": "system", "text": text, "ts": int(time.time())})

    def _broadcast_chat(self, sender: str, text: str) -> None:
        self._on_message(sender, text)
        self._broadcast(
            {"type": "chat", "from": sender, "text": text, "ts": int(time.time())}
        )

    def _broadcast(self, payload: dict) -> None:
        wire = (json.dumps(payload, separators=(",", ":")) + "\n").encode("utf-8")
        dead = []
        with self._lock:
            for conn in self._peers.keys():
                try:
                    conn.sendall(wire)
                except OSError:
                    dead.append(conn)
            for conn in dead:
                self._peers.pop(conn, None)
                try:
                    conn.close()
                except OSError:
                    pass


class ChatClient:
    def __init__(self, local_addr: str, name: str, on_message: Callable[[str, str], None]):
        host, port = parse_host_port(local_addr)
        self._name = sanitize_name(name)
        self._on_message = on_message
        self._stop = threading.Event()
        self._conn = socket.create_connection((host, port), timeout=10)
        self._recv_thread = threading.Thread(target=self._recv_loop, daemon=True)

    def start(self) -> None:
        self._send({"type": "join", "name": self._name})
        self._recv_thread.start()

    def stop(self) -> None:
        self._stop.set()
        try:
            self._conn.close()
        except OSError:
            pass
        self._recv_thread.join(timeout=1.0)

    def send_chat(self, text: str) -> None:
        text = sanitize_text(text)
        if not text:
            return
        self._send({"type": "chat", "text": text})

    def _send(self, payload: dict) -> None:
        wire = (json.dumps(payload, separators=(",", ":")) + "\n").encode("utf-8")
        self._conn.sendall(wire)

    def _recv_loop(self) -> None:
        reader = self._conn.makefile("rb")
        while not self._stop.is_set():
            try:
                raw = reader.readline(MAX_LINE_BYTES + 1)
            except OSError:
                break
            if not raw:
                self._on_message("system", "connection closed")
                break
            if len(raw) > MAX_LINE_BYTES:
                self._on_message("system", "received oversized frame")
                break
            try:
                payload = json.loads(raw.decode("utf-8"))
            except Exception:
                continue
            if not isinstance(payload, dict):
                continue
            kind = payload.get("type")
            if kind == "chat":
                sender = str(payload.get("from", "unknown"))
                text = str(payload.get("text", ""))
                self._on_message(sender, text)
            elif kind == "system":
                self._on_message("system", str(payload.get("text", "")))
        self._stop.set()


def apply_styles(app: QApplication) -> None:
    app.setStyleSheet(
        """
        QWidget {
            font-family: "Segoe UI", "SF Pro Text", "Noto Sans", sans-serif;
            font-size: 13px;
            color: #1f2937;
            background: #f8fafc;
        }
        QMainWindow {
            background: #eef2ff;
        }
        QFrame#Card {
            background: #ffffff;
            border: 1px solid #dbe3f4;
            border-radius: 12px;
        }
        QLabel#Title {
            font-size: 20px;
            font-weight: 700;
            color: #111827;
        }
        QLabel#SubTitle {
            color: #4b5563;
        }
        QLineEdit, QPlainTextEdit {
            background: #ffffff;
            border: 1px solid #cfd8ea;
            border-radius: 8px;
            padding: 6px 8px;
        }
        QLineEdit:focus, QPlainTextEdit:focus {
            border: 1px solid #2563eb;
        }
        QPushButton {
            background: #1d4ed8;
            color: #ffffff;
            border: 0;
            border-radius: 8px;
            padding: 7px 12px;
            font-weight: 600;
        }
        QPushButton:hover {
            background: #1e40af;
        }
        QPushButton#Ghost {
            background: #e5edff;
            color: #1e3a8a;
        }
        QPushButton#Ghost:hover {
            background: #dbe7ff;
        }
        QLabel#Status {
            color: #334155;
            font-weight: 600;
        }
        """
    )


class ChatMainWindow(QMainWindow):
    def __init__(self, api_base: str):
        super().__init__()
        self.setWindowTitle("Animus Link Chat")
        self.resize(1080, 700)

        self.signals = UiSignals()
        self.signals.chat_line.connect(self.on_chat_line)
        self.signals.status.connect(self.on_status)
        self.signals.error.connect(self.on_error)

        self.server: Optional[ChatServer] = None
        self.client: Optional[ChatClient] = None
        self.is_host = False

        self.api_base_input = QLineEdit(api_base)
        self.service_input = QLineEdit("chat")
        self.name_input = QLineEdit("user")
        self.invite_input = QLineEdit("")
        self.listen_input = QLineEdit("127.0.0.1:19180")
        self.allowed_peers_input = QLineEdit("peer-b")
        self.message_input = QLineEdit("")
        self.chat_log = QPlainTextEdit()
        self.status_label = QLabel("idle")

        self._build_layout()
        self._wire_actions()

    def _build_layout(self) -> None:
        root = QWidget()
        self.setCentralWidget(root)
        root_layout = QVBoxLayout(root)
        root_layout.setContentsMargins(12, 12, 12, 12)
        root_layout.setSpacing(10)

        header_card = QFrame()
        header_card.setObjectName("Card")
        header_layout = QVBoxLayout(header_card)
        title = QLabel("Animus Link Chat")
        title.setObjectName("Title")
        subtitle = QLabel("Desktop messenger over your protected relay-first network")
        subtitle.setObjectName("SubTitle")
        header_layout.addWidget(title)
        header_layout.addWidget(subtitle)
        root_layout.addWidget(header_card)

        splitter = QSplitter(Qt.Horizontal)
        root_layout.addWidget(splitter, 1)

        controls_card = QFrame()
        controls_card.setObjectName("Card")
        controls_layout = QVBoxLayout(controls_card)
        controls_layout.setContentsMargins(12, 12, 12, 12)
        controls_layout.setSpacing(10)

        grid = QGridLayout()
        grid.setHorizontalSpacing(8)
        grid.setVerticalSpacing(8)
        grid.addWidget(QLabel("Daemon API"), 0, 0)
        grid.addWidget(self.api_base_input, 0, 1)
        grid.addWidget(QLabel("Service"), 1, 0)
        grid.addWidget(self.service_input, 1, 1)
        grid.addWidget(QLabel("Display name"), 2, 0)
        grid.addWidget(self.name_input, 2, 1)
        grid.addWidget(QLabel("Invite"), 3, 0)
        grid.addWidget(self.invite_input, 3, 1)
        grid.addWidget(QLabel("Host listen"), 4, 0)
        grid.addWidget(self.listen_input, 4, 1)
        grid.addWidget(QLabel("Allowed peers (csv)"), 5, 0)
        grid.addWidget(self.allowed_peers_input, 5, 1)
        controls_layout.addLayout(grid)

        invite_buttons = QHBoxLayout()
        self.create_invite_btn = QPushButton("Create Invite")
        self.join_invite_btn = QPushButton("Join Invite")
        self.copy_invite_btn = QPushButton("Copy Invite")
        self.copy_invite_btn.setObjectName("Ghost")
        invite_buttons.addWidget(self.create_invite_btn)
        invite_buttons.addWidget(self.join_invite_btn)
        invite_buttons.addWidget(self.copy_invite_btn)
        controls_layout.addLayout(invite_buttons)

        mode_buttons = QHBoxLayout()
        self.start_host_btn = QPushButton("Start Host")
        self.join_chat_btn = QPushButton("Join Chat")
        self.disconnect_btn = QPushButton("Disconnect")
        self.disconnect_btn.setObjectName("Ghost")
        mode_buttons.addWidget(self.start_host_btn)
        mode_buttons.addWidget(self.join_chat_btn)
        mode_buttons.addWidget(self.disconnect_btn)
        controls_layout.addLayout(mode_buttons)

        self.status_label.setObjectName("Status")
        controls_layout.addWidget(self.status_label)
        controls_layout.addStretch(1)

        chat_card = QFrame()
        chat_card.setObjectName("Card")
        chat_layout = QVBoxLayout(chat_card)
        chat_layout.setContentsMargins(12, 12, 12, 12)
        chat_layout.setSpacing(10)

        chat_layout.addWidget(QLabel("Chat"))
        self.chat_log.setReadOnly(True)
        chat_layout.addWidget(self.chat_log, 1)

        send_row = QHBoxLayout()
        self.message_input.setPlaceholderText("Type a message and press Enter")
        self.send_btn = QPushButton("Send")
        send_row.addWidget(self.message_input, 1)
        send_row.addWidget(self.send_btn)
        chat_layout.addLayout(send_row)

        splitter.addWidget(controls_card)
        splitter.addWidget(chat_card)
        splitter.setSizes([410, 670])

    def _wire_actions(self) -> None:
        self.create_invite_btn.clicked.connect(self.create_invite)
        self.join_invite_btn.clicked.connect(self.join_invite)
        self.copy_invite_btn.clicked.connect(self.copy_invite)
        self.start_host_btn.clicked.connect(self.start_host)
        self.join_chat_btn.clicked.connect(self.join_chat)
        self.disconnect_btn.clicked.connect(self.disconnect)
        self.send_btn.clicked.connect(self.send_message)
        self.message_input.returnPressed.connect(self.send_message)

        quit_action = QAction(self)
        quit_action.setShortcut(QKeySequence("Ctrl+Q"))
        quit_action.triggered.connect(self.close)
        self.addAction(quit_action)

    def _api(self) -> DaemonApi:
        return DaemonApi(self.api_base_input.text().strip())

    def _emit_chat(self, sender: str, text: str) -> None:
        self.signals.chat_line.emit(sender, text)

    def on_chat_line(self, sender: str, text: str) -> None:
        self.chat_log.appendPlainText(f"[{now_hms()}] {sender}: {text}")
        self.chat_log.verticalScrollBar().setValue(
            self.chat_log.verticalScrollBar().maximum()
        )

    def on_status(self, text: str) -> None:
        self.status_label.setText(text)

    def on_error(self, title: str, message: str) -> None:
        QMessageBox.critical(self, title, message)

    def create_invite(self) -> None:
        try:
            response = self._api().post("/v1/invite/create", None)
            invite = response.get("invite")
            if not isinstance(invite, str) or not invite:
                raise AppError("daemon returned invalid invite")
            self.invite_input.setText(invite)
            self.signals.status.emit("invite created")
        except AppError as error:
            self.signals.error.emit("Create invite failed", str(error))

    def join_invite(self) -> None:
        invite = self.invite_input.text().strip()
        if not invite:
            self.signals.error.emit("Join invite failed", "invite is empty")
            return
        try:
            self._api().post("/v1/invite/join", {"invite": invite})
            self.signals.status.emit("invite accepted")
        except AppError as error:
            self.signals.error.emit("Join invite failed", str(error))

    def copy_invite(self) -> None:
        invite = self.invite_input.text().strip()
        if not invite:
            self.signals.error.emit("Copy invite failed", "invite is empty")
            return
        QApplication.clipboard().setText(invite)
        self.signals.status.emit("invite copied to clipboard")

    def start_host(self) -> None:
        self.disconnect()
        allowed = [
            peer.strip()
            for peer in self.allowed_peers_input.text().split(",")
            if peer.strip()
        ]
        if not allowed:
            self.signals.error.emit(
                "Start host failed", "allowed peers list is empty"
            )
            return

        server: Optional[ChatServer] = None
        try:
            server = ChatServer(self.listen_input.text().strip(), self._emit_chat)
            server.start()
            self._api().post(
                "/v1/expose",
                {
                    "service_name": self.service_input.text().strip(),
                    "local_addr": server.listen_addr,
                    "allowed_peers": allowed,
                },
            )
            self.server = server
            self.is_host = True
            self.signals.status.emit(f"hosting at {server.listen_addr}")
            self._emit_chat("system", "host mode started")
        except (AppError, OSError) as error:
            if server is not None:
                server.stop()
            self.server = None
            self.signals.error.emit("Start host failed", str(error))

    def join_chat(self) -> None:
        self.disconnect()
        client: Optional[ChatClient] = None
        try:
            response = self._api().post(
                "/v1/connect", {"service_name": self.service_input.text().strip()}
            )
            local_addr = response.get("local_addr")
            if not isinstance(local_addr, str) or not local_addr:
                raise AppError(
                    "daemon returned no local_addr, run in relay mode and ensure service is exposed"
                )
            client = ChatClient(local_addr, self.name_input.text().strip(), self._emit_chat)
            client.start()
            self.client = client
            self.is_host = False
            self.signals.status.emit(f"joined via {local_addr}")
            self._emit_chat("system", "joined chat")
        except (AppError, OSError) as error:
            if client is not None:
                client.stop()
            self.client = None
            self.signals.error.emit("Join chat failed", str(error))

    def send_message(self) -> None:
        text = sanitize_text(self.message_input.text())
        if not text:
            return
        name = sanitize_name(self.name_input.text().strip())
        try:
            if self.is_host and self.server is not None:
                self.server.send_local_message(name, text)
            elif self.client is not None:
                self.client.send_chat(text)
            else:
                self.signals.error.emit("Send failed", "not connected")
                return
            self.message_input.clear()
        except OSError as error:
            self.signals.error.emit("Send failed", str(error))

    def disconnect(self) -> None:
        if self.client is not None:
            self.client.stop()
            self.client = None
        if self.server is not None:
            self.server.stop()
            self.server = None
        self.is_host = False
        self.signals.status.emit("idle")

    def closeEvent(self, event) -> None:  # type: ignore[override]
        self.disconnect()
        super().closeEvent(event)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Animus Link Chat GUI")
    parser.add_argument(
        "--daemon-api",
        default="http://127.0.0.1:9999",
        help="link-daemon API base URL",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    app = QApplication([])
    apply_styles(app)
    window = ChatMainWindow(args.daemon_api)
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())

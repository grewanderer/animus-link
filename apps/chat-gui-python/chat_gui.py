#!/usr/bin/env python3
"""
Animus Link Chat GUI (MVP+)

Stateful desktop messenger on top of link-daemon API.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import threading
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

try:
    from PySide6.QtCore import QObject, Qt, Signal
    from PySide6.QtGui import QAction, QKeySequence
    from PySide6.QtWidgets import (
        QApplication,
        QFrame,
        QGridLayout,
        QHBoxLayout,
        QInputDialog,
        QLabel,
        QLineEdit,
        QListWidget,
        QListWidgetItem,
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
        "PySide6 is required. Install with: pip install -r apps/chat-gui-python/requirements.txt"
    ) from error


MAX_LINE_BYTES = 4096
MAX_TEXT_LEN = 1024
MAX_NAME_LEN = 32
MAX_MESSAGES_PER_ROOM = 2000


class AppError(Exception):
    pass


def now_unix() -> int:
    return int(time.time())


def hms_from_unix(ts: int) -> str:
    return time.strftime("%H:%M:%S", time.localtime(ts))


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


def sanitize_service_name(value: str) -> str:
    clean = "".join(ch for ch in value.strip().lower() if ch.isalnum() or ch in "-_.")
    if not clean:
        clean = "chat"
    return clean[:64]


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


@dataclass
class MessageRecord:
    id: str
    ts: int
    sender: str
    text: str
    outgoing: bool
    system: bool

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "ts": self.ts,
            "sender": self.sender,
            "text": self.text,
            "outgoing": self.outgoing,
            "system": self.system,
        }

    @staticmethod
    def from_json(data: dict) -> "MessageRecord":
        return MessageRecord(
            id=str(data.get("id", uuid.uuid4().hex)),
            ts=int(data.get("ts", now_unix())),
            sender=sanitize_name(str(data.get("sender", "anon"))),
            text=sanitize_text(str(data.get("text", ""))) or "",
            outgoing=bool(data.get("outgoing", False)),
            system=bool(data.get("system", False)),
        )


@dataclass
class RoomRecord:
    id: str
    title: str
    service_name: str
    listen_addr: str
    allowed_peers_csv: str
    created_unix: int
    unread_count: int
    messages: List[MessageRecord]

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "service_name": self.service_name,
            "listen_addr": self.listen_addr,
            "allowed_peers_csv": self.allowed_peers_csv,
            "created_unix": self.created_unix,
            "unread_count": self.unread_count,
            "messages": [message.to_json() for message in self.messages],
        }

    @staticmethod
    def from_json(data: dict) -> "RoomRecord":
        title = str(data.get("title", "Room")).strip() or "Room"
        service_name = sanitize_service_name(str(data.get("service_name", title)))
        listen_addr = str(data.get("listen_addr", "127.0.0.1:19180"))
        allowed_peers_csv = str(data.get("allowed_peers_csv", "peer-b"))
        messages_raw = data.get("messages", [])
        messages: List[MessageRecord] = []
        if isinstance(messages_raw, list):
            for item in messages_raw:
                if isinstance(item, dict):
                    messages.append(MessageRecord.from_json(item))
        if len(messages) > MAX_MESSAGES_PER_ROOM:
            messages = messages[-MAX_MESSAGES_PER_ROOM:]
        return RoomRecord(
            id=str(data.get("id", uuid.uuid4().hex)),
            title=title[:80],
            service_name=service_name,
            listen_addr=listen_addr,
            allowed_peers_csv=allowed_peers_csv[:512],
            created_unix=int(data.get("created_unix", now_unix())),
            unread_count=max(0, int(data.get("unread_count", 0))),
            messages=messages,
        )


class LocalStateStore:
    def __init__(self, state_file: Path):
        self.state_file = state_file
        self.profile_name = "user"
        self.rooms: List[RoomRecord] = []
        self._load()

    def _load(self) -> None:
        if not self.state_file.exists():
            self.rooms = [self._default_room()]
            return
        try:
            data = json.loads(self.state_file.read_text(encoding="utf-8"))
        except Exception:
            self.rooms = [self._default_room()]
            return
        if not isinstance(data, dict):
            self.rooms = [self._default_room()]
            return
        self.profile_name = sanitize_name(str(data.get("profile_name", "user")))
        rooms_raw = data.get("rooms", [])
        rooms: List[RoomRecord] = []
        if isinstance(rooms_raw, list):
            for item in rooms_raw:
                if isinstance(item, dict):
                    rooms.append(RoomRecord.from_json(item))
        if not rooms:
            rooms = [self._default_room()]
        self.rooms = rooms

    def save(self) -> None:
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": 1,
            "profile_name": self.profile_name,
            "rooms": [room.to_json() for room in self.rooms],
        }
        tmp = self.state_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=True, separators=(",", ":")), encoding="utf-8")
        os.replace(tmp, self.state_file)

    @staticmethod
    def _default_room() -> RoomRecord:
        return RoomRecord(
            id=uuid.uuid4().hex,
            title="General",
            service_name="chat",
            listen_addr="127.0.0.1:19180",
            allowed_peers_csv="peer-b",
            created_unix=now_unix(),
            unread_count=0,
            messages=[],
        )

    def find_room(self, room_id: str) -> Optional[RoomRecord]:
        for room in self.rooms:
            if room.id == room_id:
                return room
        return None

    def append_message(
        self,
        room_id: str,
        sender: str,
        text: str,
        *,
        outgoing: bool,
        system: bool,
        mark_unread: bool,
    ) -> None:
        room = self.find_room(room_id)
        if room is None:
            return
        message = MessageRecord(
            id=uuid.uuid4().hex,
            ts=now_unix(),
            sender=sanitize_name(sender) if not system else "system",
            text=sanitize_text(text) or "",
            outgoing=outgoing,
            system=system,
        )
        room.messages.append(message)
        if len(room.messages) > MAX_MESSAGES_PER_ROOM:
            room.messages = room.messages[-MAX_MESSAGES_PER_ROOM:]
        if mark_unread:
            room.unread_count = min(room.unread_count + 1, 9999)
        self.save()


class UiSignals(QObject):
    chat_event = Signal(str, str, str, bool, bool)
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
        self._broadcast({"type": "system", "text": text, "ts": now_unix()})

    def _broadcast_chat(self, sender: str, text: str) -> None:
        self._on_message(sender, text)
        self._broadcast(
            {"type": "chat", "from": sender, "text": text, "ts": now_unix()}
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
        QMainWindow { background: #eef2ff; }
        QFrame#Card {
            background: #ffffff;
            border: 1px solid #dbe3f4;
            border-radius: 12px;
        }
        QLabel#Title {
            font-size: 20px;
            font-weight: 700;
            color: #0f172a;
        }
        QLabel#SubTitle { color: #475569; }
        QLabel#Status {
            color: #334155;
            font-weight: 600;
            padding: 4px 0;
        }
        QLineEdit, QPlainTextEdit, QListWidget {
            background: #ffffff;
            border: 1px solid #cfd8ea;
            border-radius: 8px;
            padding: 6px 8px;
        }
        QLineEdit:focus, QPlainTextEdit:focus, QListWidget:focus {
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
        QPushButton:hover { background: #1e40af; }
        QPushButton#Ghost {
            background: #e5edff;
            color: #1e3a8a;
        }
        QPushButton#Ghost:hover { background: #dbe7ff; }
        """
    )


class ChatMainWindow(QMainWindow):
    def __init__(self, api_base: str, state_file: Path):
        super().__init__()
        self.setWindowTitle("Animus Link Messenger")
        self.resize(1200, 760)

        self.signals = UiSignals()
        self.signals.chat_event.connect(self.on_chat_event)
        self.signals.status.connect(self.on_status)
        self.signals.error.connect(self.on_error)

        self.store = LocalStateStore(state_file)
        self.selected_room_id: Optional[str] = None
        self.connected_room_id: Optional[str] = None
        self._refreshing_rooms = False

        self.server: Optional[ChatServer] = None
        self.client: Optional[ChatClient] = None
        self.is_host = False

        self.api_base_input = QLineEdit(api_base)
        self.name_input = QLineEdit(self.store.profile_name)
        self.invite_input = QLineEdit("")
        self.chat_log = QPlainTextEdit()
        self.chat_log.setReadOnly(True)
        self.message_input = QLineEdit("")
        self.message_input.setPlaceholderText("Type a message and press Enter")
        self.status_label = QLabel("idle")
        self.status_label.setObjectName("Status")

        self.rooms_list = QListWidget()
        self.room_service_input = QLineEdit("")
        self.room_listen_input = QLineEdit("")
        self.room_allowed_peers_input = QLineEdit("")

        self._build_layout()
        self._wire_actions()
        self.refresh_rooms()
        self.select_first_room()

    def _build_layout(self) -> None:
        root = QWidget()
        self.setCentralWidget(root)
        root_layout = QVBoxLayout(root)
        root_layout.setContentsMargins(12, 12, 12, 12)
        root_layout.setSpacing(10)

        header = QFrame()
        header.setObjectName("Card")
        header_layout = QVBoxLayout(header)
        title = QLabel("Animus Link Messenger")
        title.setObjectName("Title")
        subtitle = QLabel("Rooms, history, invite onboarding, host/join communication")
        subtitle.setObjectName("SubTitle")
        header_layout.addWidget(title)
        header_layout.addWidget(subtitle)
        root_layout.addWidget(header)

        top_controls = QFrame()
        top_controls.setObjectName("Card")
        controls_layout = QGridLayout(top_controls)
        controls_layout.setHorizontalSpacing(8)
        controls_layout.setVerticalSpacing(8)
        controls_layout.addWidget(QLabel("Daemon API"), 0, 0)
        controls_layout.addWidget(self.api_base_input, 0, 1)
        controls_layout.addWidget(QLabel("Profile name"), 0, 2)
        controls_layout.addWidget(self.name_input, 0, 3)
        controls_layout.addWidget(QLabel("Invite"), 1, 0)
        controls_layout.addWidget(self.invite_input, 1, 1, 1, 3)

        invite_buttons = QHBoxLayout()
        self.create_invite_btn = QPushButton("Create Invite")
        self.join_invite_btn = QPushButton("Join Invite")
        self.copy_invite_btn = QPushButton("Copy Invite")
        self.copy_invite_btn.setObjectName("Ghost")
        invite_buttons.addWidget(self.create_invite_btn)
        invite_buttons.addWidget(self.join_invite_btn)
        invite_buttons.addWidget(self.copy_invite_btn)
        controls_layout.addLayout(invite_buttons, 2, 0, 1, 4)
        root_layout.addWidget(top_controls)

        splitter = QSplitter(Qt.Horizontal)
        root_layout.addWidget(splitter, 1)

        left_card = QFrame()
        left_card.setObjectName("Card")
        left_layout = QVBoxLayout(left_card)
        left_layout.setContentsMargins(12, 12, 12, 12)
        left_layout.setSpacing(10)
        left_layout.addWidget(QLabel("Rooms"))
        left_layout.addWidget(self.rooms_list, 1)

        room_actions = QHBoxLayout()
        self.new_room_btn = QPushButton("New Room")
        self.rename_room_btn = QPushButton("Rename")
        self.delete_room_btn = QPushButton("Delete")
        self.delete_room_btn.setObjectName("Ghost")
        room_actions.addWidget(self.new_room_btn)
        room_actions.addWidget(self.rename_room_btn)
        room_actions.addWidget(self.delete_room_btn)
        left_layout.addLayout(room_actions)

        room_fields = QGridLayout()
        room_fields.addWidget(QLabel("Service"), 0, 0)
        room_fields.addWidget(self.room_service_input, 0, 1)
        room_fields.addWidget(QLabel("Listen"), 1, 0)
        room_fields.addWidget(self.room_listen_input, 1, 1)
        room_fields.addWidget(QLabel("Allowed peers (csv)"), 2, 0)
        room_fields.addWidget(self.room_allowed_peers_input, 2, 1)
        left_layout.addLayout(room_fields)

        room_network_actions = QHBoxLayout()
        self.start_host_btn = QPushButton("Start Host")
        self.join_chat_btn = QPushButton("Join Room")
        self.disconnect_btn = QPushButton("Disconnect")
        self.disconnect_btn.setObjectName("Ghost")
        room_network_actions.addWidget(self.start_host_btn)
        room_network_actions.addWidget(self.join_chat_btn)
        room_network_actions.addWidget(self.disconnect_btn)
        left_layout.addLayout(room_network_actions)

        right_card = QFrame()
        right_card.setObjectName("Card")
        right_layout = QVBoxLayout(right_card)
        right_layout.setContentsMargins(12, 12, 12, 12)
        right_layout.setSpacing(10)
        right_layout.addWidget(QLabel("Conversation"))
        right_layout.addWidget(self.chat_log, 1)

        send_row = QHBoxLayout()
        self.send_btn = QPushButton("Send")
        send_row.addWidget(self.message_input, 1)
        send_row.addWidget(self.send_btn)
        right_layout.addLayout(send_row)
        right_layout.addWidget(self.status_label)

        splitter.addWidget(left_card)
        splitter.addWidget(right_card)
        splitter.setSizes([430, 770])

    def _wire_actions(self) -> None:
        self.create_invite_btn.clicked.connect(self.create_invite)
        self.join_invite_btn.clicked.connect(self.join_invite)
        self.copy_invite_btn.clicked.connect(self.copy_invite)
        self.new_room_btn.clicked.connect(self.create_room)
        self.rename_room_btn.clicked.connect(self.rename_room)
        self.delete_room_btn.clicked.connect(self.delete_room)
        self.rooms_list.currentItemChanged.connect(self.on_room_changed)
        self.start_host_btn.clicked.connect(self.start_host)
        self.join_chat_btn.clicked.connect(self.join_room)
        self.disconnect_btn.clicked.connect(self.disconnect)
        self.send_btn.clicked.connect(self.send_message)
        self.message_input.returnPressed.connect(self.send_message)
        self.name_input.editingFinished.connect(self.save_profile_name)
        self.room_service_input.editingFinished.connect(self.save_room_settings)
        self.room_listen_input.editingFinished.connect(self.save_room_settings)
        self.room_allowed_peers_input.editingFinished.connect(self.save_room_settings)

        quit_action = QAction(self)
        quit_action.setShortcut(QKeySequence("Ctrl+Q"))
        quit_action.triggered.connect(self.close)
        self.addAction(quit_action)

    def _api(self) -> DaemonApi:
        return DaemonApi(self.api_base_input.text().strip())

    def refresh_rooms(self) -> None:
        current = self.selected_room_id
        self._refreshing_rooms = True
        self.rooms_list.clear()
        for room in self.store.rooms:
            label = room.title
            if room.unread_count > 0:
                label = f"{label} ({room.unread_count})"
            item = QListWidgetItem(label)
            item.setData(Qt.UserRole, room.id)
            self.rooms_list.addItem(item)
            if current is not None and room.id == current:
                self.rooms_list.setCurrentItem(item)
        self._refreshing_rooms = False

    def select_first_room(self) -> None:
        if self.rooms_list.count() > 0 and self.rooms_list.currentItem() is None:
            self.rooms_list.setCurrentRow(0)

    def current_room(self) -> Optional[RoomRecord]:
        if self.selected_room_id is None:
            return None
        return self.store.find_room(self.selected_room_id)

    def on_room_changed(self, current: Optional[QListWidgetItem], _previous: Optional[QListWidgetItem]) -> None:
        if self._refreshing_rooms:
            return
        if current is None:
            self.selected_room_id = None
            self.chat_log.clear()
            return
        room_id = current.data(Qt.UserRole)
        if not isinstance(room_id, str):
            return
        self.selected_room_id = room_id
        room = self.store.find_room(room_id)
        if room is None:
            return
        room.unread_count = 0
        self.store.save()
        self.room_service_input.setText(room.service_name)
        self.room_listen_input.setText(room.listen_addr)
        self.room_allowed_peers_input.setText(room.allowed_peers_csv)
        self.render_room_messages(room)
        self.refresh_rooms()

    def render_room_messages(self, room: RoomRecord) -> None:
        self.chat_log.clear()
        for message in room.messages:
            if message.system:
                self.chat_log.appendPlainText(
                    f"[{hms_from_unix(message.ts)}] system: {message.text}"
                )
                continue
            sender = "You" if message.outgoing else message.sender
            self.chat_log.appendPlainText(
                f"[{hms_from_unix(message.ts)}] {sender}: {message.text}"
            )
        self.chat_log.verticalScrollBar().setValue(
            self.chat_log.verticalScrollBar().maximum()
        )

    def save_profile_name(self) -> None:
        self.store.profile_name = sanitize_name(self.name_input.text())
        self.name_input.setText(self.store.profile_name)
        self.store.save()

    def save_room_settings(self) -> None:
        room = self.current_room()
        if room is None:
            return
        room.service_name = sanitize_service_name(self.room_service_input.text())
        room.listen_addr = self.room_listen_input.text().strip() or "127.0.0.1:19180"
        room.allowed_peers_csv = self.room_allowed_peers_input.text().strip() or "peer-b"
        self.room_service_input.setText(room.service_name)
        self.room_listen_input.setText(room.listen_addr)
        self.room_allowed_peers_input.setText(room.allowed_peers_csv)
        self.store.save()

    def create_room(self) -> None:
        title, ok = QInputDialog.getText(self, "New Room", "Room title:")
        if not ok:
            return
        title = title.strip() or "Room"
        default_service = sanitize_service_name(title)
        service, ok = QInputDialog.getText(
            self, "New Room", "Service name:", text=default_service
        )
        if not ok:
            return
        service = sanitize_service_name(service)
        room = RoomRecord(
            id=uuid.uuid4().hex,
            title=title[:80],
            service_name=service,
            listen_addr="127.0.0.1:19180",
            allowed_peers_csv="peer-b",
            created_unix=now_unix(),
            unread_count=0,
            messages=[],
        )
        self.store.rooms.append(room)
        self.store.save()
        self.refresh_rooms()
        self.select_room_by_id(room.id)

    def rename_room(self) -> None:
        room = self.current_room()
        if room is None:
            self.signals.error.emit("Rename room failed", "no room selected")
            return
        title, ok = QInputDialog.getText(self, "Rename Room", "Room title:", text=room.title)
        if not ok:
            return
        room.title = (title.strip() or room.title)[:80]
        self.store.save()
        self.refresh_rooms()
        self.select_room_by_id(room.id)

    def delete_room(self) -> None:
        room = self.current_room()
        if room is None:
            self.signals.error.emit("Delete room failed", "no room selected")
            return
        if len(self.store.rooms) == 1:
            self.signals.error.emit("Delete room failed", "at least one room must remain")
            return
        if (
            QMessageBox.question(
                self,
                "Delete room",
                f"Delete room '{room.title}' with all local history?",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No,
            )
            != QMessageBox.Yes
        ):
            return
        self.disconnect_if_room_connected(room.id)
        self.store.rooms = [item for item in self.store.rooms if item.id != room.id]
        self.store.save()
        self.refresh_rooms()
        self.select_first_room()

    def select_room_by_id(self, room_id: str) -> None:
        for index in range(self.rooms_list.count()):
            item = self.rooms_list.item(index)
            if item.data(Qt.UserRole) == room_id:
                self.rooms_list.setCurrentItem(item)
                return

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
        self.signals.status.emit("invite copied")

    def room_allowed_peers(self, room: RoomRecord) -> List[str]:
        peers = [item.strip() for item in room.allowed_peers_csv.split(",") if item.strip()]
        if not peers:
            raise AppError("allowed peers list is empty")
        return peers

    def start_host(self) -> None:
        room = self.current_room()
        if room is None:
            self.signals.error.emit("Start host failed", "select a room first")
            return
        self.save_room_settings()
        self.disconnect()
        server: Optional[ChatServer] = None
        try:
            allowed_peers = self.room_allowed_peers(room)
            server = ChatServer(room.listen_addr, lambda s, t: self.emit_network_message(room.id, s, t))
            server.start()
            self._api().post(
                "/v1/expose",
                {
                    "service_name": room.service_name,
                    "local_addr": server.listen_addr,
                    "allowed_peers": allowed_peers,
                },
            )
            room.listen_addr = server.listen_addr
            self.store.save()
            self.room_listen_input.setText(room.listen_addr)
            self.server = server
            self.is_host = True
            self.connected_room_id = room.id
            self.signals.status.emit(f"hosting room '{room.title}' at {room.listen_addr}")
            self.signals.chat_event.emit(room.id, "system", "host mode started", False, True)
        except (AppError, OSError) as error:
            if server is not None:
                server.stop()
            self.server = None
            self.signals.error.emit("Start host failed", str(error))

    def join_room(self) -> None:
        room = self.current_room()
        if room is None:
            self.signals.error.emit("Join room failed", "select a room first")
            return
        self.save_room_settings()
        self.disconnect()
        client: Optional[ChatClient] = None
        try:
            response = self._api().post("/v1/connect", {"service_name": room.service_name})
            local_addr = response.get("local_addr")
            if not isinstance(local_addr, str) or not local_addr:
                raise AppError(
                    "daemon returned no local_addr, run relay mode and ensure room is hosted"
                )
            client = ChatClient(
                local_addr,
                self.name_input.text().strip(),
                lambda s, t: self.emit_network_message(room.id, s, t),
            )
            client.start()
            self.client = client
            self.is_host = False
            self.connected_room_id = room.id
            self.signals.status.emit(f"joined room '{room.title}' via {local_addr}")
            self.signals.chat_event.emit(room.id, "system", "joined room", False, True)
        except (AppError, OSError) as error:
            if client is not None:
                client.stop()
            self.client = None
            self.signals.error.emit("Join room failed", str(error))

    def emit_network_message(self, room_id: str, sender: str, text: str) -> None:
        is_system = sender == "system"
        current_name = sanitize_name(self.name_input.text().strip())
        outgoing = (
            not is_system
            and self.connected_room_id == room_id
            and sanitize_name(sender) == current_name
        )
        self.signals.chat_event.emit(room_id, sender, text, outgoing, is_system)

    def send_message(self) -> None:
        room = self.current_room()
        if room is None:
            self.signals.error.emit("Send failed", "select a room")
            return
        text = sanitize_text(self.message_input.text())
        if not text:
            return
        sender = sanitize_name(self.name_input.text().strip())
        if self.connected_room_id != room.id:
            self.signals.error.emit(
                "Send failed", "this room is not connected; use Start Host or Join Room"
            )
            return
        try:
            if self.is_host and self.server is not None:
                self.server.send_local_message(sender, text)
            elif self.client is not None:
                self.client.send_chat(text)
                self.signals.chat_event.emit(room.id, sender, text, True, False)
            else:
                self.signals.error.emit("Send failed", "not connected")
                return
            self.message_input.clear()
        except OSError as error:
            self.signals.error.emit("Send failed", str(error))

    def on_chat_event(self, room_id: str, sender: str, text: str, outgoing: bool, system: bool) -> None:
        selected = self.selected_room_id == room_id
        mark_unread = not selected
        self.store.append_message(
            room_id,
            sender,
            text,
            outgoing=outgoing,
            system=system,
            mark_unread=mark_unread,
        )
        if selected:
            room = self.store.find_room(room_id)
            if room is not None:
                self.render_room_messages(room)
        self.refresh_rooms()
        self.select_room_by_id(self.selected_room_id or room_id)

    def disconnect_if_room_connected(self, room_id: str) -> None:
        if self.connected_room_id == room_id:
            self.disconnect()

    def disconnect(self) -> None:
        if self.client is not None:
            self.client.stop()
            self.client = None
        if self.server is not None:
            self.server.stop()
            self.server = None
        self.is_host = False
        self.connected_room_id = None
        self.signals.status.emit("idle")

    def on_status(self, text: str) -> None:
        self.status_label.setText(text)

    def on_error(self, title: str, message: str) -> None:
        QMessageBox.critical(self, title, message)

    def closeEvent(self, event) -> None:  # type: ignore[override]
        self.save_profile_name()
        self.save_room_settings()
        self.disconnect()
        super().closeEvent(event)


def default_state_file() -> Path:
    return Path(".animus-link/chat/state.json")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Animus Link Messenger GUI")
    parser.add_argument(
        "--daemon-api",
        default="http://127.0.0.1:9999",
        help="link-daemon API base URL",
    )
    parser.add_argument(
        "--state-file",
        default=str(default_state_file()),
        help="local state file path",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    app = QApplication([])
    apply_styles(app)
    window = ChatMainWindow(args.daemon_api, Path(args.state_file))
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())

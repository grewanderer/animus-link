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
import tkinter as tk
from dataclasses import dataclass
from tkinter import messagebox, ttk
from typing import Callable, Dict, Optional, Tuple
import urllib.error
import urllib.request


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
                raise AppError(f"daemon HTTP error: {error.code}: {code}: {message}") from error
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


class ChatGuiApp:
    def __init__(self, root: tk.Tk, api_base: str):
        self.root = root
        self.root.title("Animus Link Chat (MVP)")
        self.api_base_var = tk.StringVar(value=api_base)
        self.service_var = tk.StringVar(value="chat")
        self.name_var = tk.StringVar(value="user")
        self.listen_var = tk.StringVar(value="127.0.0.1:19180")
        self.allowed_peers_var = tk.StringVar(value="peer-b")
        self.invite_var = tk.StringVar(value="")
        self.status_var = tk.StringVar(value="idle")

        self.server: Optional[ChatServer] = None
        self.client: Optional[ChatClient] = None
        self.is_host = False

        self._build_ui()
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self) -> None:
        frame = ttk.Frame(self.root, padding=10)
        frame.grid(row=0, column=0, sticky="nsew")
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        frame.columnconfigure(1, weight=1)

        ttk.Label(frame, text="Daemon API").grid(row=0, column=0, sticky="w")
        ttk.Entry(frame, textvariable=self.api_base_var).grid(row=0, column=1, sticky="ew")

        ttk.Label(frame, text="Service").grid(row=1, column=0, sticky="w")
        ttk.Entry(frame, textvariable=self.service_var).grid(row=1, column=1, sticky="ew")

        ttk.Label(frame, text="Display name").grid(row=2, column=0, sticky="w")
        ttk.Entry(frame, textvariable=self.name_var).grid(row=2, column=1, sticky="ew")

        ttk.Label(frame, text="Invite").grid(row=3, column=0, sticky="w")
        ttk.Entry(frame, textvariable=self.invite_var).grid(row=3, column=1, sticky="ew")

        invite_buttons = ttk.Frame(frame)
        invite_buttons.grid(row=4, column=0, columnspan=2, sticky="ew", pady=(4, 8))
        ttk.Button(invite_buttons, text="Create Invite", command=self.create_invite).grid(
            row=0, column=0, padx=(0, 4)
        )
        ttk.Button(invite_buttons, text="Join Invite", command=self.join_invite).grid(
            row=0, column=1, padx=(4, 0)
        )

        ttk.Label(frame, text="Host listen").grid(row=5, column=0, sticky="w")
        ttk.Entry(frame, textvariable=self.listen_var).grid(row=5, column=1, sticky="ew")
        ttk.Label(frame, text="Allowed peers (csv)").grid(row=6, column=0, sticky="w")
        ttk.Entry(frame, textvariable=self.allowed_peers_var).grid(row=6, column=1, sticky="ew")

        mode_buttons = ttk.Frame(frame)
        mode_buttons.grid(row=7, column=0, columnspan=2, sticky="ew", pady=(4, 8))
        ttk.Button(mode_buttons, text="Start Host", command=self.start_host).grid(
            row=0, column=0, padx=(0, 4)
        )
        ttk.Button(mode_buttons, text="Join Chat", command=self.join_chat).grid(
            row=0, column=1, padx=(4, 4)
        )
        ttk.Button(mode_buttons, text="Disconnect", command=self.disconnect).grid(
            row=0, column=2, padx=(4, 0)
        )

        self.chat_view = tk.Text(frame, height=18, state="disabled")
        self.chat_view.grid(row=8, column=0, columnspan=2, sticky="nsew")
        frame.rowconfigure(8, weight=1)

        send_row = ttk.Frame(frame)
        send_row.grid(row=9, column=0, columnspan=2, sticky="ew", pady=(8, 0))
        send_row.columnconfigure(0, weight=1)
        self.message_entry = ttk.Entry(send_row)
        self.message_entry.grid(row=0, column=0, sticky="ew")
        ttk.Button(send_row, text="Send", command=self.send_message).grid(row=0, column=1)
        self.message_entry.bind("<Return>", lambda _: self.send_message())

        ttk.Label(frame, textvariable=self.status_var).grid(row=10, column=0, columnspan=2, sticky="w")

    def _api(self) -> DaemonApi:
        return DaemonApi(self.api_base_var.get().strip())

    def _append_chat(self, sender: str, text: str) -> None:
        def update() -> None:
            self.chat_view.configure(state="normal")
            self.chat_view.insert("end", f"[{now_hms()}] {sender}: {text}\n")
            self.chat_view.see("end")
            self.chat_view.configure(state="disabled")

        self.root.after(0, update)

    def create_invite(self) -> None:
        try:
            response = self._api().post("/v1/invite/create", None)
            invite = response.get("invite")
            if not isinstance(invite, str) or not invite:
                raise AppError("daemon returned invalid invite")
            self.invite_var.set(invite)
            self.status_var.set("invite created")
        except AppError as error:
            messagebox.showerror("Create invite failed", str(error))

    def join_invite(self) -> None:
        invite = self.invite_var.get().strip()
        if not invite:
            messagebox.showerror("Join invite failed", "invite is empty")
            return
        try:
            self._api().post("/v1/invite/join", {"invite": invite})
            self.status_var.set("invite accepted")
        except AppError as error:
            messagebox.showerror("Join invite failed", str(error))

    def start_host(self) -> None:
        self.disconnect()
        allowed = [
            peer.strip()
            for peer in self.allowed_peers_var.get().split(",")
            if peer.strip()
        ]
        if not allowed:
            messagebox.showerror("Start host failed", "allowed peers list is empty")
            return
        server: Optional[ChatServer] = None
        try:
            server = ChatServer(self.listen_var.get().strip(), self._append_chat)
            server.start()
            self._api().post(
                "/v1/expose",
                {
                    "service_name": self.service_var.get().strip(),
                    "local_addr": server.listen_addr,
                    "allowed_peers": allowed,
                },
            )
            self.server = server
            self.is_host = True
            self.status_var.set(f"hosting at {server.listen_addr}")
            self._append_chat("system", "host mode started")
        except (AppError, OSError) as error:
            if server is not None:
                server.stop()
            self.server = None
            messagebox.showerror("Start host failed", str(error))

    def join_chat(self) -> None:
        self.disconnect()
        client: Optional[ChatClient] = None
        try:
            response = self._api().post(
                "/v1/connect", {"service_name": self.service_var.get().strip()}
            )
            local_addr = response.get("local_addr")
            if not isinstance(local_addr, str) or not local_addr:
                raise AppError(
                    "daemon returned no local_addr, run in relay mode and ensure service is exposed"
                )
            client = ChatClient(local_addr, self.name_var.get().strip(), self._append_chat)
            client.start()
            self.client = client
            self.is_host = False
            self.status_var.set(f"joined via {local_addr}")
            self._append_chat("system", "joined chat")
        except (AppError, OSError) as error:
            if client is not None:
                client.stop()
            self.client = None
            messagebox.showerror("Join chat failed", str(error))

    def send_message(self) -> None:
        text = sanitize_text(self.message_entry.get())
        if not text:
            return
        name = sanitize_name(self.name_var.get().strip())
        try:
            if self.is_host and self.server is not None:
                self.server.send_local_message(name, text)
            elif self.client is not None:
                self.client.send_chat(text)
            else:
                messagebox.showerror("Send failed", "not connected")
                return
            self.message_entry.delete(0, "end")
        except OSError as error:
            messagebox.showerror("Send failed", str(error))

    def disconnect(self) -> None:
        if self.client is not None:
            self.client.stop()
            self.client = None
        if self.server is not None:
            self.server.stop()
            self.server = None
        self.is_host = False
        self.status_var.set("idle")

    def _on_close(self) -> None:
        self.disconnect()
        self.root.destroy()


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
    root = tk.Tk()
    ChatGuiApp(root, args.daemon_api)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

import 'server-only';

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const MAX_ROOM_MESSAGES = 2000;
const DEFAULT_DAEMON_API = 'http://127.0.0.1:9999';
const DEFAULT_STATE_FILE = '.animus-link/messenger-web/state.json';
const MAX_MESSAGE_TEXT = 1024;

export type ConnectionMode = 'idle' | 'host' | 'joined';

export type MessengerMessage = {
  seq: number;
  id: string;
  ts: number;
  sender: string;
  text: string;
  outgoing: boolean;
  system: boolean;
};

export type MessengerRoom = {
  id: string;
  title: string;
  serviceName: string;
  listenAddr: string;
  allowedPeersCsv: string;
  connection: ConnectionMode;
  connected: boolean;
  lastError: string | null;
  currentSeq: number;
  messages: MessengerMessage[];
};

export type MessengerSnapshot = {
  profileName: string;
  daemonApi: string;
  rooms: MessengerRoom[];
};

type PersistedMessage = {
  seq: number;
  id: string;
  ts: number;
  sender: string;
  text: string;
  outgoing: boolean;
  system: boolean;
};

type PersistedRoom = {
  id: string;
  title: string;
  serviceName: string;
  listenAddr: string;
  allowedPeersCsv: string;
  currentSeq: number;
  messages: PersistedMessage[];
};

type PersistedState = {
  profileName: string;
  daemonApi: string;
  rooms: PersistedRoom[];
};

type HostRuntime = {
  mode: 'host';
  server: net.Server;
  sockets: Set<net.Socket>;
  socketBuffers: Map<net.Socket, string>;
  peerNames: Map<net.Socket, string>;
};

type JoinedRuntime = {
  mode: 'joined';
  socket: net.Socket;
  buffer: string;
};

type RoomRuntime = HostRuntime | JoinedRuntime;

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function sanitizeName(value: string): string {
  const clean = value
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, 32);
  return clean || 'user';
}

function sanitizeServiceName(value: string): string {
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 64);
  return clean || 'chat';
}

function sanitizeText(value: string): string | null {
  const clean = value.replace(/\r/g, '').replace(/\n/g, '').trim().slice(0, MAX_MESSAGE_TEXT);
  return clean.length > 0 ? clean : null;
}

function parseHostPort(value: string): { host: string; port: number } {
  const normalized = value.trim();
  const splitIndex = normalized.lastIndexOf(':');
  if (splitIndex <= 0) {
    throw new Error(`invalid address: ${value}`);
  }
  const host = normalized.slice(0, splitIndex).replace(/^\[|\]$/g, '').trim();
  const portRaw = normalized.slice(splitIndex + 1).trim();
  const port = Number.parseInt(portRaw, 10);
  if (!host || !Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`invalid address: ${value}`);
  }
  return { host, port };
}

function formatAddress(host: string, port: number): string {
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]:${port}`;
  }
  return `${host}:${port}`;
}

function parseAllowedPeers(csv: string): string[] {
  const peers = csv
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (peers.length === 0) {
    throw new Error('allowed peers list is empty');
  }
  return peers;
}

function stateFilePath(): string {
  return process.env.ANIMUS_MESSENGER_STATE_FILE?.trim() || DEFAULT_STATE_FILE;
}

function makeDefaultRoom(): MessengerRoom {
  return {
    id: randomUUID(),
    title: 'General',
    serviceName: 'chat',
    listenAddr: '127.0.0.1:19180',
    allowedPeersCsv: 'peer-b',
    connection: 'idle',
    connected: false,
    lastError: null,
    currentSeq: 0,
    messages: [],
  };
}

async function daemonPost(
  daemonApi: string,
  endpoint: string,
  payload?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${daemonApi}${endpoint}`, {
    method: 'POST',
    headers: payload ? { 'content-type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    cache: 'no-store',
  });
  const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = parsed.error;
    if (typeof error === 'object' && error !== null) {
      const code = String((error as { code?: unknown }).code ?? 'unknown');
      const message = String((error as { message?: unknown }).message ?? 'unknown');
      throw new Error(`daemon ${response.status}: ${code}: ${message}`);
    }
    throw new Error(`daemon ${response.status}`);
  }
  const error = parsed.error;
  if (typeof error === 'object' && error !== null) {
    const code = String((error as { code?: unknown }).code ?? 'unknown');
    const message = String((error as { message?: unknown }).message ?? 'unknown');
    throw new Error(`${code}: ${message}`);
  }
  return parsed;
}

export class MessengerRuntime {
  private state: MessengerSnapshot;
  private roomRuntime = new Map<string, RoomRuntime>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly persistedPath: string;

  constructor() {
    this.persistedPath = stateFilePath();
    this.state = this.loadState();
  }

  snapshot(): MessengerSnapshot {
    return {
      profileName: this.state.profileName,
      daemonApi: this.state.daemonApi,
      rooms: this.state.rooms.map((room) => ({ ...room, messages: room.messages.slice(-120) })),
    };
  }

  roomMessages(roomId: string, afterSeq: number): { roomId: string; currentSeq: number; messages: MessengerMessage[] } {
    const room = this.getRoom(roomId);
    const messages = room.messages.filter((message) => message.seq > afterSeq).slice(-200);
    return { roomId, currentSeq: room.currentSeq, messages };
  }

  async handleAction(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (action) {
      case 'update_settings':
        this.updateSettings(payload);
        return { ok: true, snapshot: this.snapshot() };
      case 'create_room':
        return { ok: true, room: this.createRoom(payload), snapshot: this.snapshot() };
      case 'update_room':
        this.updateRoom(payload);
        return { ok: true, snapshot: this.snapshot() };
      case 'delete_room':
        await this.deleteRoom(payload);
        return { ok: true, snapshot: this.snapshot() };
      case 'invite_create': {
        const invite = await this.inviteCreate();
        return { ok: true, invite, snapshot: this.snapshot() };
      }
      case 'invite_join':
        await this.inviteJoin(payload);
        return { ok: true, snapshot: this.snapshot() };
      case 'host_room':
        await this.hostRoom(payload);
        return { ok: true, snapshot: this.snapshot() };
      case 'join_room':
        await this.joinRoom(payload);
        return { ok: true, snapshot: this.snapshot() };
      case 'disconnect_room':
        await this.disconnectRoom(payload);
        return { ok: true, snapshot: this.snapshot() };
      case 'send_message':
        await this.sendMessage(payload);
        return { ok: true, snapshot: this.snapshot() };
      default:
        throw new Error(`unsupported action: ${action}`);
    }
  }

  private loadState(): MessengerSnapshot {
    const roomFromPersisted = (room: PersistedRoom): MessengerRoom => ({
      id: room.id || randomUUID(),
      title: room.title || 'Room',
      serviceName: sanitizeServiceName(room.serviceName || room.title || 'chat'),
      listenAddr: room.listenAddr || '127.0.0.1:19180',
      allowedPeersCsv: room.allowedPeersCsv || 'peer-b',
      connection: 'idle',
      connected: false,
      lastError: null,
      currentSeq: Number.isFinite(room.currentSeq) ? room.currentSeq : 0,
      messages: Array.isArray(room.messages)
        ? room.messages
            .map((message) => ({
              seq: Number.isFinite(message.seq) ? message.seq : 0,
              id: message.id || randomUUID(),
              ts: Number.isFinite(message.ts) ? message.ts : nowUnix(),
              sender: sanitizeName(message.sender || 'user'),
              text: sanitizeText(message.text || '') || '',
              outgoing: Boolean(message.outgoing),
              system: Boolean(message.system),
            }))
            .slice(-MAX_ROOM_MESSAGES)
        : [],
    });

    try {
      const raw = fs.readFileSync(this.persistedPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      const roomsRaw = Array.isArray(parsed.rooms) ? parsed.rooms : [];
      const rooms = roomsRaw.length > 0 ? roomsRaw.map(roomFromPersisted) : [makeDefaultRoom()];
      return {
        profileName: sanitizeName(typeof parsed.profileName === 'string' ? parsed.profileName : 'user'),
        daemonApi:
          typeof parsed.daemonApi === 'string' && parsed.daemonApi.trim().length > 0
            ? parsed.daemonApi.trim()
            : DEFAULT_DAEMON_API,
        rooms,
      };
    } catch {
      return {
        profileName: 'user',
        daemonApi: DEFAULT_DAEMON_API,
        rooms: [makeDefaultRoom()],
      };
    }
  }

  private queuePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistNow();
    }, 120);
  }

  private persistNow(): void {
    const persisted: PersistedState = {
      profileName: this.state.profileName,
      daemonApi: this.state.daemonApi,
      rooms: this.state.rooms.map((room) => ({
        id: room.id,
        title: room.title,
        serviceName: room.serviceName,
        listenAddr: room.listenAddr,
        allowedPeersCsv: room.allowedPeersCsv,
        currentSeq: room.currentSeq,
        messages: room.messages.slice(-MAX_ROOM_MESSAGES),
      })),
    };
    const directory = path.dirname(this.persistedPath);
    fs.mkdirSync(directory, { recursive: true });
    const tempPath = `${this.persistedPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(persisted), 'utf8');
    fs.renameSync(tempPath, this.persistedPath);
  }

  private getRoom(roomId: string): MessengerRoom {
    const room = this.state.rooms.find((item) => item.id === roomId);
    if (!room) {
      throw new Error('room not found');
    }
    return room;
  }

  private getPayloadString(payload: Record<string, unknown>, key: string): string {
    const value = payload[key];
    if (typeof value !== 'string') {
      throw new Error(`missing field: ${key}`);
    }
    return value;
  }

  private updateSettings(payload: Record<string, unknown>): void {
    if (typeof payload.profileName === 'string') {
      this.state.profileName = sanitizeName(payload.profileName);
    }
    if (typeof payload.daemonApi === 'string' && payload.daemonApi.trim().length > 0) {
      this.state.daemonApi = payload.daemonApi.trim();
    }
    this.queuePersist();
  }

  private createRoom(payload: Record<string, unknown>): MessengerRoom {
    const rawTitle = typeof payload.title === 'string' ? payload.title : '';
    const rawService = typeof payload.serviceName === 'string' ? payload.serviceName : '';
    const room: MessengerRoom = {
      id: randomUUID(),
      title: rawTitle.trim().slice(0, 80) || 'Room',
      serviceName: sanitizeServiceName(rawService || rawTitle),
      listenAddr: '127.0.0.1:19180',
      allowedPeersCsv: 'peer-b',
      connection: 'idle',
      connected: false,
      lastError: null,
      currentSeq: 0,
      messages: [],
    };
    this.state.rooms.push(room);
    this.queuePersist();
    return room;
  }

  private updateRoom(payload: Record<string, unknown>): void {
    const room = this.getRoom(this.getPayloadString(payload, 'roomId'));
    if (typeof payload.title === 'string') {
      room.title = payload.title.trim().slice(0, 80) || room.title;
    }
    if (typeof payload.serviceName === 'string') {
      room.serviceName = sanitizeServiceName(payload.serviceName);
    }
    if (typeof payload.listenAddr === 'string' && payload.listenAddr.trim().length > 0) {
      room.listenAddr = payload.listenAddr.trim();
    }
    if (typeof payload.allowedPeersCsv === 'string' && payload.allowedPeersCsv.trim().length > 0) {
      room.allowedPeersCsv = payload.allowedPeersCsv.trim().slice(0, 512);
    }
    this.queuePersist();
  }

  private async deleteRoom(payload: Record<string, unknown>): Promise<void> {
    const roomId = this.getPayloadString(payload, 'roomId');
    if (this.state.rooms.length <= 1) {
      throw new Error('at least one room must remain');
    }
    await this.closeRuntime(roomId);
    this.state.rooms = this.state.rooms.filter((room) => room.id !== roomId);
    this.queuePersist();
  }

  private async inviteCreate(): Promise<string> {
    const response = await daemonPost(this.state.daemonApi, '/v1/invite/create');
    const invite = response.invite;
    if (typeof invite !== 'string' || invite.length === 0) {
      throw new Error('daemon returned invalid invite');
    }
    return invite;
  }

  private async inviteJoin(payload: Record<string, unknown>): Promise<void> {
    const invite = this.getPayloadString(payload, 'invite').trim();
    if (!invite) {
      throw new Error('invite is empty');
    }
    await daemonPost(this.state.daemonApi, '/v1/invite/join', { invite });
  }

  private setRoomConnection(room: MessengerRoom, mode: ConnectionMode, connected: boolean): void {
    room.connection = mode;
    room.connected = connected;
    if (connected) {
      room.lastError = null;
    }
  }

  private appendMessage(
    roomId: string,
    sender: string,
    text: string,
    options: { outgoing: boolean; system: boolean },
  ): void {
    const room = this.state.rooms.find((item) => item.id === roomId);
    if (!room) {
      return;
    }
    const cleanText = sanitizeText(text);
    if (!cleanText) {
      return;
    }
    room.currentSeq += 1;
    room.messages.push({
      seq: room.currentSeq,
      id: randomUUID(),
      ts: nowUnix(),
      sender: options.system ? 'system' : sanitizeName(sender),
      text: cleanText,
      outgoing: options.outgoing,
      system: options.system,
    });
    if (room.messages.length > MAX_ROOM_MESSAGES) {
      room.messages = room.messages.slice(-MAX_ROOM_MESSAGES);
    }
    this.queuePersist();
  }

  private sendLine(socket: net.Socket, payload: Record<string, unknown>): void {
    socket.write(`${JSON.stringify(payload)}\n`);
  }

  private broadcastHost(runtime: HostRuntime, payload: Record<string, unknown>): void {
    const line = `${JSON.stringify(payload)}\n`;
    for (const socket of runtime.sockets) {
      socket.write(line);
    }
  }

  private handleHostSocket(roomId: string, runtime: HostRuntime, socket: net.Socket): void {
    runtime.sockets.add(socket);
    runtime.socketBuffers.set(socket, '');

    socket.on('data', (chunk: Buffer) => {
      const previous = runtime.socketBuffers.get(socket) ?? '';
      const combined = previous + chunk.toString('utf8');
      const lines = combined.split('\n');
      const rest = lines.pop() ?? '';
      runtime.socketBuffers.set(socket, rest);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          continue;
        }
        const type = parsed.type;
        if (type === 'join') {
          const peer = sanitizeName(typeof parsed.name === 'string' ? parsed.name : 'peer');
          runtime.peerNames.set(socket, peer);
          this.appendMessage(roomId, 'system', `${peer} joined`, {
            outgoing: false,
            system: true,
          });
          this.broadcastHost(runtime, { type: 'system', text: `${peer} joined`, ts: nowUnix() });
          continue;
        }
        if (type === 'chat') {
          const peer = runtime.peerNames.get(socket) ?? 'peer';
          const text = sanitizeText(typeof parsed.text === 'string' ? parsed.text : '');
          if (!text) {
            continue;
          }
          this.appendMessage(roomId, peer, text, {
            outgoing: false,
            system: false,
          });
          this.broadcastHost(runtime, { type: 'chat', from: peer, text, ts: nowUnix() });
        }
      }
    });

    socket.on('error', () => {
      // Socket lifecycle is handled by close event.
    });

    socket.on('close', () => {
      runtime.sockets.delete(socket);
      runtime.socketBuffers.delete(socket);
      const peer = runtime.peerNames.get(socket);
      runtime.peerNames.delete(socket);
      if (peer) {
        this.appendMessage(roomId, 'system', `${peer} left`, {
          outgoing: false,
          system: true,
        });
        this.broadcastHost(runtime, { type: 'system', text: `${peer} left`, ts: nowUnix() });
      }
    });
  }

  private async closeRuntime(roomId: string): Promise<void> {
    const runtime = this.roomRuntime.get(roomId);
    if (!runtime) {
      const room = this.state.rooms.find((item) => item.id === roomId);
      if (room) {
        this.setRoomConnection(room, 'idle', false);
      }
      return;
    }

    if (runtime.mode === 'host') {
      for (const socket of runtime.sockets) {
        socket.destroy();
      }
      runtime.sockets.clear();
      await new Promise<void>((resolve) => {
        runtime.server.close(() => resolve());
      });
    } else {
      runtime.socket.destroy();
    }

    this.roomRuntime.delete(roomId);
    const room = this.state.rooms.find((item) => item.id === roomId);
    if (room) {
      this.setRoomConnection(room, 'idle', false);
    }
    this.queuePersist();
  }

  private async closeAllRuntimesExcept(roomId: string): Promise<void> {
    const roomIds = [...this.roomRuntime.keys()].filter((id) => id !== roomId);
    for (const id of roomIds) {
      await this.closeRuntime(id);
    }
  }

  private async hostRoom(payload: Record<string, unknown>): Promise<void> {
    const roomId = this.getPayloadString(payload, 'roomId');
    const room = this.getRoom(roomId);

    await this.closeAllRuntimesExcept(roomId);
    await this.closeRuntime(roomId);

    const allowedPeers = parseAllowedPeers(room.allowedPeersCsv);
    const { host, port } = parseHostPort(room.listenAddr);
    const runtime: HostRuntime = {
      mode: 'host',
      server: net.createServer(),
      sockets: new Set(),
      socketBuffers: new Map(),
      peerNames: new Map(),
    };

    runtime.server.on('connection', (socket) => {
      this.handleHostSocket(roomId, runtime, socket);
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      runtime.server.once('error', onError);
      runtime.server.listen(port, host, () => {
        runtime.server.off('error', onError);
        resolve();
      });
    });

    const listen = runtime.server.address();
    if (!listen || typeof listen === 'string') {
      runtime.server.close();
      throw new Error('failed to resolve host listen address');
    }
    room.listenAddr = formatAddress(listen.address, listen.port);

    try {
      await daemonPost(this.state.daemonApi, '/v1/expose', {
        service_name: room.serviceName,
        local_addr: room.listenAddr,
        allowed_peers: allowedPeers,
      });
    } catch (error) {
      await new Promise<void>((resolve) => runtime.server.close(() => resolve()));
      throw error;
    }

    this.roomRuntime.set(roomId, runtime);
    this.setRoomConnection(room, 'host', true);
    this.appendMessage(roomId, 'system', 'host mode started', {
      outgoing: false,
      system: true,
    });
  }

  private async joinRoom(payload: Record<string, unknown>): Promise<void> {
    const roomId = this.getPayloadString(payload, 'roomId');
    const room = this.getRoom(roomId);

    await this.closeAllRuntimesExcept(roomId);
    await this.closeRuntime(roomId);

    const connect = await daemonPost(this.state.daemonApi, '/v1/connect', {
      service_name: room.serviceName,
    });
    const localAddr = connect.local_addr;
    if (typeof localAddr !== 'string' || localAddr.length === 0) {
      throw new Error('daemon returned no local_addr');
    }
    const endpoint = parseHostPort(localAddr);
    const socket = net.createConnection({ host: endpoint.host, port: endpoint.port });
    const runtime: JoinedRuntime = { mode: 'joined', socket, buffer: '' };
    this.roomRuntime.set(roomId, runtime);
    this.setRoomConnection(room, 'joined', false);

    socket.on('connect', () => {
      this.setRoomConnection(room, 'joined', true);
      this.sendLine(socket, { type: 'join', name: this.state.profileName });
      this.appendMessage(roomId, 'system', 'joined room', {
        outgoing: false,
        system: true,
      });
    });

    socket.on('data', (chunk: Buffer) => {
      runtime.buffer += chunk.toString('utf8');
      const lines = runtime.buffer.split('\n');
      runtime.buffer = lines.pop() ?? '';

      for (const raw of lines) {
        const line = raw.trim();
        if (!line) {
          continue;
        }
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
        const type = parsed.type;
        if (type === 'chat') {
          const sender = sanitizeName(typeof parsed.from === 'string' ? parsed.from : 'peer');
          const text = sanitizeText(typeof parsed.text === 'string' ? parsed.text : '');
          if (!text) {
            continue;
          }
          this.appendMessage(roomId, sender, text, {
            outgoing: sender === this.state.profileName,
            system: false,
          });
          continue;
        }
        if (type === 'system') {
          const text = sanitizeText(typeof parsed.text === 'string' ? parsed.text : '');
          if (!text) {
            continue;
          }
          this.appendMessage(roomId, 'system', text, {
            outgoing: false,
            system: true,
          });
        }
      }
    });

    socket.on('error', (error: Error) => {
      room.lastError = error.message;
      room.connected = false;
      this.queuePersist();
    });

    socket.on('close', () => {
      room.connected = false;
      if (this.roomRuntime.get(roomId) === runtime) {
        this.roomRuntime.delete(roomId);
        this.setRoomConnection(room, 'idle', false);
      }
      this.appendMessage(roomId, 'system', 'connection closed', {
        outgoing: false,
        system: true,
      });
    });
  }

  private async disconnectRoom(payload: Record<string, unknown>): Promise<void> {
    const roomId = this.getPayloadString(payload, 'roomId');
    await this.closeRuntime(roomId);
  }

  private async sendMessage(payload: Record<string, unknown>): Promise<void> {
    const roomId = this.getPayloadString(payload, 'roomId');
    const room = this.getRoom(roomId);
    const text = sanitizeText(this.getPayloadString(payload, 'text'));
    if (!text) {
      throw new Error('message is empty');
    }
    const runtime = this.roomRuntime.get(roomId);
    if (!runtime || !room.connected) {
      throw new Error('room is not connected');
    }

    if (runtime.mode === 'host') {
      const sender = this.state.profileName;
      this.appendMessage(roomId, sender, text, { outgoing: true, system: false });
      this.broadcastHost(runtime, { type: 'chat', from: sender, text, ts: nowUnix() });
      return;
    }

    this.sendLine(runtime.socket, { type: 'chat', text });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __animusMessengerRuntime: MessengerRuntime | undefined;
}

export function getMessengerRuntime(): MessengerRuntime {
  if (!globalThis.__animusMessengerRuntime) {
    globalThis.__animusMessengerRuntime = new MessengerRuntime();
  }
  return globalThis.__animusMessengerRuntime;
}

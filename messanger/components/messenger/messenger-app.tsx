'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type ConnectionMode = 'idle' | 'host' | 'joined';

type MessengerMessage = {
  seq: number;
  id: string;
  ts: number;
  sender: string;
  avatar: string | null;
  text: string;
  outgoing: boolean;
  system: boolean;
};

type MessengerRoom = {
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

type MessengerSnapshot = {
  profileName: string;
  profileAvatar: string | null;
  daemonApi: string;
  rooms: MessengerRoom[];
};

type ActionResult = {
  ok: boolean;
  error?: string;
  invite?: string;
  room?: MessengerRoom;
  snapshot?: MessengerSnapshot;
};

type MessagesResult = {
  ok: boolean;
  error?: string;
  roomId: string;
  currentSeq: number;
  messages: MessengerMessage[];
};

function formatTime(unixTs: number): string {
  return new Date(unixTs * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const MAX_AVATAR_FILE_BYTES = 192 * 1024;
const JOIN_CHAT_NOTICE = '\u0412\u043e\u0439\u0434\u0438\u0442\u0435 \u0432 \u0447\u0430\u0442';

function avatarInitial(name: string): string {
  const clean = name.trim();
  if (!clean) {
    return '?';
  }
  return clean[0].toUpperCase();
}

function messagePreview(message: MessengerMessage | undefined): string {
  if (!message) {
    return 'No messages yet';
  }
  const value = message.text.trim();
  if (!value) {
    return 'Empty message';
  }
  return value.length > 42 ? `${value.slice(0, 42)}...` : value;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('failed to read avatar image'));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error('failed to read avatar image'));
    reader.readAsDataURL(file);
  });
}

const ADVANCED_UI = (() => {
  const raw = process.env.NEXT_PUBLIC_MESSENGER_ADVANCED_UI;
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
})();

export function MessengerApp() {
  const [snapshot, setSnapshot] = useState<MessengerSnapshot | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [messageSeq, setMessageSeq] = useState<number>(0);
  const [profileName, setProfileName] = useState('user');
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [daemonApi, setDaemonApi] = useState('http://127.0.0.1:9999');
  const [invite, setInvite] = useState('');
  const [draft, setDraft] = useState('');
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [newRoomService, setNewRoomService] = useState('');
  const [roomTitle, setRoomTitle] = useState('');
  const [roomService, setRoomService] = useState('');
  const [roomListenAddr, setRoomListenAddr] = useState('');
  const [roomAllowedPeers, setRoomAllowedPeers] = useState('');
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const messageSeqRef = useRef(0);
  const initializedRoomIdRef = useRef<string | null>(null);
  const profileNameDirtyRef = useRef(false);
  const profileAvatarDirtyRef = useRef(false);
  const daemonApiDirtyRef = useRef(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    messageSeqRef.current = messageSeq;
  }, [messageSeq]);

  const selectedRoom = useMemo(
    () => snapshot?.rooms.find((room) => room.id === selectedRoomId) ?? null,
    [snapshot, selectedRoomId],
  );

  const applySnapshot = useCallback((nextSnapshot: MessengerSnapshot, forceSyncInputs = false): void => {
    setSnapshot(nextSnapshot);
    if (forceSyncInputs || !profileNameDirtyRef.current) {
      setProfileName(nextSnapshot.profileName);
    }
    if (forceSyncInputs || !profileAvatarDirtyRef.current) {
      setProfileAvatar(nextSnapshot.profileAvatar);
    }
    if (forceSyncInputs || !daemonApiDirtyRef.current) {
      setDaemonApi(nextSnapshot.daemonApi);
    }
  }, []);

  const loadSnapshot = useCallback(async (): Promise<void> => {
    const response = await fetch('/api/messenger', { cache: 'no-store' });
    const parsed = (await response.json()) as { ok?: boolean; error?: string; snapshot?: MessengerSnapshot };
    if (!response.ok || !parsed.ok || !parsed.snapshot) {
      throw new Error(parsed.error || 'failed to load messenger state');
    }
    applySnapshot(parsed.snapshot);
  }, [applySnapshot]);

  const postAction = useCallback(
    async (
      action: string,
      payload: Record<string, unknown> = {},
      options: { forceSyncInputs?: boolean } = {},
    ): Promise<ActionResult> => {
      const response = await fetch('/api/messenger', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      const parsed = (await response.json()) as ActionResult;
      if (!response.ok || !parsed.ok) {
        throw new Error(parsed.error || `action failed: ${action}`);
      }
      if (parsed.snapshot) {
        applySnapshot(parsed.snapshot, Boolean(options.forceSyncInputs));
      }
      return parsed;
    },
    [applySnapshot],
  );

  const loadRoomMessages = useCallback(async (roomId: string, afterSeq: number): Promise<MessagesResult> => {
    const response = await fetch(
      `/api/messenger?roomId=${encodeURIComponent(roomId)}&afterSeq=${encodeURIComponent(String(afterSeq))}`,
      { cache: 'no-store' },
    );
    const parsed = (await response.json()) as MessagesResult;
    if (!response.ok || !parsed.ok) {
      throw new Error(parsed.error || 'failed to load room messages');
    }
    return parsed;
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSnapshot()
      .then(() => {
        if (cancelled) {
          return;
        }
        setStatus('State loaded');
      })
      .catch((reason) => {
        if (cancelled) {
          return;
        }
        const message = reason instanceof Error ? reason.message : 'failed to initialize';
        setError(message);
      });
    return () => {
      cancelled = true;
    };
  }, [loadSnapshot]);

  useEffect(() => {
    if (!snapshot || snapshot.rooms.length === 0) {
      setSelectedRoomId(null);
      return;
    }
    if (selectedRoomId && snapshot.rooms.some((room) => room.id === selectedRoomId)) {
      return;
    }
    setSelectedRoomId(snapshot.rooms[0].id);
  }, [selectedRoomId, snapshot]);

  useEffect(() => {
    if (!selectedRoom) {
      initializedRoomIdRef.current = null;
      setRoomTitle('');
      setRoomService('');
      setRoomListenAddr('');
      setRoomAllowedPeers('');
      setMessages([]);
      setMessageSeq(0);
      return;
    }
    if (initializedRoomIdRef.current === selectedRoom.id) {
      return;
    }
    initializedRoomIdRef.current = selectedRoom.id;
    setRoomTitle(selectedRoom.title);
    setRoomService(selectedRoom.serviceName);
    setRoomListenAddr(selectedRoom.listenAddr);
    setRoomAllowedPeers(selectedRoom.allowedPeersCsv);
    setMessages([]);
    setMessageSeq(0);
    loadRoomMessages(selectedRoom.id, 0)
      .then((data) => {
        setMessages(data.messages);
        setMessageSeq(data.currentSeq);
      })
      .catch((reason) => {
        const message = reason instanceof Error ? reason.message : 'failed to fetch room messages';
        setError(message);
      });
  }, [loadRoomMessages, selectedRoom]);

  useEffect(() => {
    if (!selectedRoomId) {
      return;
    }
    const interval = window.setInterval(() => {
      loadRoomMessages(selectedRoomId, messageSeqRef.current)
        .then((data) => {
          if (data.messages.length > 0) {
            setMessages((previous) => {
              const merged = [...previous, ...data.messages];
              return merged.slice(-500);
            });
          }
          setMessageSeq(data.currentSeq);
        })
        .catch(() => {
          // Keep polling without surfacing periodic errors aggressively.
        });
    }, 1200);
    return () => {
      window.clearInterval(interval);
    };
  }, [loadRoomMessages, selectedRoomId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadSnapshot().catch(() => {
        // Keep periodic sync silent to avoid noisy popups.
      });
    }, 2500);
    return () => {
      window.clearInterval(interval);
    };
  }, [loadSnapshot]);

  const onSaveSettings = useCallback(async (): Promise<void> => {
    if (!selectedRoomId) {
      return;
    }
    setBusy('save');
    setError(null);
    try {
      await postAction('update_settings', { profileName, profileAvatar, daemonApi }, { forceSyncInputs: true });
      profileNameDirtyRef.current = false;
      profileAvatarDirtyRef.current = false;
      daemonApiDirtyRef.current = false;
      await postAction('update_room', {
        roomId: selectedRoomId,
        title: roomTitle,
        serviceName: roomService,
        listenAddr: roomListenAddr,
        allowedPeersCsv: roomAllowedPeers,
      });
      setStatus('Settings saved');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'failed to save settings';
      setError(message);
      throw reason;
    } finally {
      setBusy(null);
    }
  }, [
    daemonApi,
    postAction,
    profileAvatar,
    profileName,
    roomAllowedPeers,
    roomListenAddr,
    roomService,
    roomTitle,
    selectedRoomId,
  ]);

  const onCreateRoom = useCallback(async (): Promise<void> => {
    setBusy('create-room');
    setError(null);
    try {
      const result = await postAction('create_room', {
        title: newRoomTitle,
        serviceName: newRoomService,
      });
      if (result.room) {
        setSelectedRoomId(result.room.id);
      }
      setNewRoomTitle('');
      setNewRoomService('');
      setStatus('Room created');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'failed to create room';
      setError(message);
    } finally {
      setBusy(null);
    }
  }, [newRoomService, newRoomTitle, postAction]);

  const onDeleteRoom = useCallback(async (): Promise<void> => {
    if (!selectedRoomId) {
      return;
    }
    if (!window.confirm('Delete selected room and local history?')) {
      return;
    }
    setBusy('delete-room');
    setError(null);
    try {
      await postAction('delete_room', { roomId: selectedRoomId });
      setStatus('Room deleted');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'failed to delete room';
      setError(message);
    } finally {
      setBusy(null);
    }
  }, [postAction, selectedRoomId]);

  const onInviteCreate = useCallback(async (): Promise<void> => {
    setBusy('invite-create');
    setError(null);
    try {
      await postAction('update_settings', { profileName, profileAvatar, daemonApi }, { forceSyncInputs: true });
      profileNameDirtyRef.current = false;
      profileAvatarDirtyRef.current = false;
      daemonApiDirtyRef.current = false;
      const result = await postAction('invite_create');
      if (typeof result.invite === 'string') {
        setInvite(result.invite);
      }
      setStatus('Invite created');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'failed to create invite';
      setError(message);
    } finally {
      setBusy(null);
    }
  }, [daemonApi, postAction, profileAvatar, profileName]);

  const onInviteJoin = useCallback(async (): Promise<void> => {
    setBusy('invite-join');
    setError(null);
    try {
      await postAction('update_settings', { profileName, profileAvatar, daemonApi }, { forceSyncInputs: true });
      profileNameDirtyRef.current = false;
      profileAvatarDirtyRef.current = false;
      daemonApiDirtyRef.current = false;
      await postAction('invite_join', { invite });
      setStatus('Invite accepted');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'failed to join invite';
      setError(message);
    } finally {
      setBusy(null);
    }
  }, [daemonApi, invite, postAction, profileAvatar, profileName]);

  const onChooseAvatar = useCallback(async (file: File | null): Promise<void> => {
    if (!file) {
      return;
    }
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    if (!allowedTypes.has(file.type)) {
      setError('avatar format is not supported');
      return;
    }
    if (file.size > MAX_AVATAR_FILE_BYTES) {
      setError('avatar is too large (max 192 KB)');
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      profileAvatarDirtyRef.current = true;
      setProfileAvatar(dataUrl);
      setError(null);
      setStatus('Avatar selected. Click Save to apply.');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'failed to read avatar image';
      setError(message);
    }
  }, []);

  const onRemoveAvatar = useCallback((): void => {
    profileAvatarDirtyRef.current = true;
    setProfileAvatar(null);
    setError(null);
    setStatus('Avatar removed. Click Save to apply.');
  }, []);

  const onHostRoom = useCallback(async (): Promise<void> => {
    if (!selectedRoomId) {
      return;
    }
    setBusy('host');
    setError(null);
    try {
      await onSaveSettings();
      await postAction('host_room', { roomId: selectedRoomId });
      setStatus('Room hosted');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'failed to host room';
      setError(message);
    } finally {
      setBusy(null);
    }
  }, [onSaveSettings, postAction, selectedRoomId]);

  const onJoinRoom = useCallback(async (): Promise<void> => {
    if (!selectedRoomId) {
      return;
    }
    setBusy('join');
    setError(null);
    try {
      await onSaveSettings();
      await postAction('join_room', { roomId: selectedRoomId });
      setStatus('Room joined');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'failed to join room';
      setError(message);
    } finally {
      setBusy(null);
    }
  }, [onSaveSettings, postAction, selectedRoomId]);

  const onDisconnectRoom = useCallback(async (): Promise<void> => {
    if (!selectedRoomId) {
      return;
    }
    setBusy('disconnect');
    setError(null);
    try {
      await postAction('disconnect_room', { roomId: selectedRoomId });
      setStatus('Disconnected');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'failed to disconnect room';
      setError(message);
    } finally {
      setBusy(null);
    }
  }, [postAction, selectedRoomId]);

  const onSend = useCallback(async (): Promise<void> => {
    if (!selectedRoomId) {
      return;
    }
    if (!draft.trim()) {
      return;
    }
    setBusy('send');
    setError(null);
    try {
      await postAction('send_message', { roomId: selectedRoomId, text: draft });
      setDraft('');
      const result = await loadRoomMessages(selectedRoomId, messageSeqRef.current);
      if (result.messages.length > 0) {
        setMessages((previous) => [...previous, ...result.messages].slice(-500));
      }
      setMessageSeq(result.currentSeq);
      setStatus('Message sent');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'failed to send message';
      setError(message);
    } finally {
      setBusy(null);
    }
  }, [draft, loadRoomMessages, postAction, selectedRoomId]);

  const connectionBadge = useMemo(() => {
    if (!selectedRoom) {
      return <Badge variant="outline">No room</Badge>;
    }
    if (selectedRoom.connection === 'host' && selectedRoom.connected) {
      return <Badge variant="neon">Hosting</Badge>;
    }
    if (selectedRoom.connection === 'joined' && selectedRoom.connected) {
      return <Badge variant="default">Joined</Badge>;
    }
    return <Badge variant="outline">Idle</Badge>;
  }, [selectedRoom]);

  const roomItems = useMemo(() => {
    return (snapshot?.rooms ?? []).map((room) => {
      const lastMessage = room.messages[room.messages.length - 1];
      return {
        room,
        lastMessage,
      };
    });
  }, [snapshot]);
  const isChatEntered = Boolean(selectedRoom && selectedRoom.connected);

  return (
    <main className="mx-auto w-full max-w-7xl px-3 pb-5 pt-3 sm:px-6">
      <section className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Profile</CardTitle>
              <CardDescription>{ADVANCED_UI ? 'Developer mode enabled' : 'Secure Link messenger'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                {profileAvatar ? (
                  <img
                    src={profileAvatar}
                    alt="Profile avatar"
                    className="h-12 w-12 rounded-full border border-white/20 object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-base font-semibold text-white/80">
                    {avatarInitial(profileName)}
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    value={profileName}
                    placeholder="Your name"
                    onChange={(event) => {
                      profileNameDirtyRef.current = true;
                      setProfileName(event.target.value);
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        void onChooseAvatar(file);
                        event.target.value = '';
                      }}
                    />
                    <Button size="sm" variant="outline" onClick={() => avatarInputRef.current?.click()} disabled={busy !== null}>
                      Avatar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onRemoveAvatar} disabled={busy !== null}>
                      Remove
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void onSaveSettings().catch(() => undefined)}
                      disabled={busy !== null || !selectedRoomId}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
              {ADVANCED_UI ? (
                <Input
                  value={daemonApi}
                  placeholder="Daemon API"
                  onChange={(event) => {
                    daemonApiDirtyRef.current = true;
                    setDaemonApi(event.target.value);
                  }}
                />
              ) : null}
              <div className="space-y-2">
                <Textarea
                  rows={2}
                  value={invite}
                  onChange={(event) => setInvite(event.target.value)}
                  placeholder="Invite code"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" onClick={() => void onInviteCreate()} disabled={busy !== null}>
                    Create Invite
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void onInviteJoin()} disabled={busy !== null}>
                    Join Invite
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Chats</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => void onDeleteRoom()} disabled={busy !== null || !selectedRoomId}>
                  Delete
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="space-y-2 pr-1">
                {roomItems.map(({ room, lastMessage }) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => setSelectedRoomId(room.id)}
                    className={cn(
                      'w-full rounded-2xl border px-3 py-3 text-left transition',
                      selectedRoomId === room.id
                        ? 'border-brand-300/70 bg-brand-400/20 text-white'
                        : 'border-white/10 bg-white/[0.03] text-white/80 hover:border-white/30 hover:bg-white/10',
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{room.title}</span>
                      <span className="text-[10px] uppercase tracking-wide text-white/50">{room.connection}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-white/55">
                      <span className="truncate">{messagePreview(lastMessage)}</span>
                      <span>{lastMessage ? formatTime(lastMessage.ts) : '--:--'}</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="space-y-2 border-t border-white/10 pt-3">
                <Input
                  value={newRoomTitle}
                  onChange={(event) => setNewRoomTitle(event.target.value)}
                  placeholder="New chat title"
                />
                {ADVANCED_UI ? (
                  <Input
                    value={newRoomService}
                    onChange={(event) => setNewRoomService(event.target.value)}
                    placeholder="Service name (optional)"
                  />
                ) : null}
                <Button variant="outline" onClick={() => void onCreateRoom()} disabled={busy !== null}>
                  Add Chat
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>

        <Card className="flex flex-col p-0">
          <CardHeader className="border-b border-white/10 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="truncate">{selectedRoom?.title ?? 'Conversation'}</CardTitle>
                <CardDescription className="mt-1 break-words [overflow-wrap:anywhere]">{status}</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {connectionBadge}
                <Button size="sm" onClick={() => void onHostRoom()} disabled={busy !== null || !selectedRoomId}>
                  Start Host
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void onJoinRoom()} disabled={busy !== null || !selectedRoomId}>
                  Join Room
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void onDisconnectRoom()} disabled={busy !== null || !selectedRoomId}>
                  Disconnect
                </Button>
              </div>
            </div>
            {ADVANCED_UI ? (
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <Input value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} placeholder="Room title" />
                <Input value={roomService} onChange={(event) => setRoomService(event.target.value)} placeholder="Service name" />
                <Input
                  value={roomListenAddr}
                  onChange={(event) => setRoomListenAddr(event.target.value)}
                  placeholder="Listen address"
                />
                <Input
                  value={roomAllowedPeers}
                  onChange={(event) => setRoomAllowedPeers(event.target.value)}
                  placeholder="Allowed peers CSV"
                  className="md:col-span-2"
                />
              </div>
            ) : null}
            {error ? (
              <div className="mt-3 rounded-xl border border-red-400/40 bg-red-500/15 px-3 py-2 text-sm text-red-100 break-words [overflow-wrap:anywhere]">
                {error}
              </div>
            ) : null}
          </CardHeader>

          <CardContent className="flex flex-col p-0">
            <div className="space-y-3 bg-[#060d18]/85 p-4">
              {!isChatEntered ? (
                <div className="mx-auto rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-white/50 text-transparent break-words [overflow-wrap:anywhere]">
                  Войдите в чат
                  <span className="text-white/50">{JOIN_CHAT_NOTICE}</span>
                </div>
              ) : (
                <>
                  {messages.map((message) =>
                    message.system ? (
                      <div
                        key={message.id}
                        className="mx-auto max-w-[90%] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-xs text-white/70 break-words [overflow-wrap:anywhere]"
                      >
                        {message.text}
                      </div>
                    ) : (
                      <div key={message.id} className={cn('flex', message.outgoing ? 'justify-end' : 'justify-start')}>
                        <div
                          className={cn(
                            'max-w-[82%] rounded-2xl border px-3 py-2 text-sm',
                            message.outgoing
                              ? 'border-brand-300/50 bg-brand-400/20 text-white'
                              : 'border-white/10 bg-white/[0.06] text-white/90',
                          )}
                        >
                          <div className="mb-1 flex items-center justify-between gap-3 text-[11px] uppercase tracking-wide text-white/55">
                            <span className="flex min-w-0 items-center gap-2">
                              {message.avatar ? (
                                <img
                                  src={message.avatar}
                                  alt={`${message.sender} avatar`}
                                  className="h-5 w-5 rounded-full border border-white/20 object-cover"
                                />
                              ) : (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[10px] font-semibold text-white/80">
                                  {avatarInitial(message.sender)}
                                </span>
                              )}
                              <span className="max-w-[140px] truncate">{message.sender}</span>
                            </span>
                            <span>{formatTime(message.ts)}</span>
                          </div>
                          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">{message.text}</p>
                        </div>
                      </div>
                    ),
                  )}
                  {messages.length === 0 ? (
                    <div className="mx-auto rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-white/50 break-words [overflow-wrap:anywhere]">
                      No messages yet for this chat.
                    </div>
                  ) : null}
                </>
              )}
            </div>
            <div className="border-t border-white/10 bg-[#07101b] p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  rows={2}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={isChatEntered ? 'Write a message...' : 'Join chat first...'}
                  className="min-h-[76px]"
                  disabled={!isChatEntered}
                />
                <Button onClick={() => void onSend()} disabled={busy !== null || !selectedRoomId || !isChatEntered} className="h-10 shrink-0">
                  Send
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

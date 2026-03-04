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

export function MessengerApp() {
  const [snapshot, setSnapshot] = useState<MessengerSnapshot | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [messageSeq, setMessageSeq] = useState<number>(0);
  const [profileName, setProfileName] = useState('user');
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

  useEffect(() => {
    messageSeqRef.current = messageSeq;
  }, [messageSeq]);

  const selectedRoom = useMemo(
    () => snapshot?.rooms.find((room) => room.id === selectedRoomId) ?? null,
    [snapshot, selectedRoomId],
  );

  const loadSnapshot = useCallback(async (): Promise<void> => {
    const response = await fetch('/api/messenger', { cache: 'no-store' });
    const parsed = (await response.json()) as { ok?: boolean; error?: string; snapshot?: MessengerSnapshot };
    if (!response.ok || !parsed.ok || !parsed.snapshot) {
      throw new Error(parsed.error || 'failed to load messenger state');
    }
    setSnapshot(parsed.snapshot);
    setProfileName(parsed.snapshot.profileName);
    setDaemonApi(parsed.snapshot.daemonApi);
    setStatus('State loaded');
  }, []);

  const postAction = useCallback(
    async (action: string, payload: Record<string, unknown> = {}): Promise<ActionResult> => {
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
        setSnapshot(parsed.snapshot);
        setProfileName(parsed.snapshot.profileName);
        setDaemonApi(parsed.snapshot.daemonApi);
      }
      return parsed;
    },
    [],
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
      setRoomTitle('');
      setRoomService('');
      setRoomListenAddr('');
      setRoomAllowedPeers('');
      setMessages([]);
      setMessageSeq(0);
      return;
    }
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
      await postAction('update_settings', { profileName, daemonApi });
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
      await postAction('update_settings', { profileName, daemonApi });
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
  }, [daemonApi, postAction, profileName]);

  const onInviteJoin = useCallback(async (): Promise<void> => {
    setBusy('invite-join');
    setError(null);
    try {
      await postAction('update_settings', { profileName, daemonApi });
      await postAction('invite_join', { invite });
      setStatus('Invite accepted');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'failed to join invite';
      setError(message);
    } finally {
      setBusy(null);
    }
  }, [daemonApi, invite, postAction, profileName]);

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

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-3 sm:px-6 lg:px-10">
      <section className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Link</CardTitle>
            <CardDescription>Web messenger UI with Node runtime over Link daemon network APIs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.16em] text-white/60">Profile</label>
              <Input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.16em] text-white/60">Daemon API</label>
              <Input value={daemonApi} onChange={(event) => setDaemonApi(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.16em] text-white/60">Invite</label>
              <Textarea
                rows={3}
                value={invite}
                onChange={(event) => setInvite(event.target.value)}
                placeholder="animus://invite/v1/..."
              />
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => void onInviteCreate()} disabled={busy !== null}>
                  Create Invite
                </Button>
                <Button variant="secondary" onClick={() => void onInviteJoin()} disabled={busy !== null}>
                  Join Invite
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.16em] text-white/60">Rooms</span>
                <Button size="sm" variant="ghost" onClick={() => void onDeleteRoom()} disabled={busy !== null}>
                  Delete
                </Button>
              </div>
              <div className="space-y-2">
                {snapshot?.rooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => setSelectedRoomId(room.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition',
                      selectedRoomId === room.id
                        ? 'border-brand-300/70 bg-brand-400/20 text-white'
                        : 'border-white/10 bg-white/[0.03] text-white/80 hover:border-white/30 hover:bg-white/10',
                    )}
                  >
                    <span>{room.title}</span>
                    <span className="text-[11px] uppercase tracking-wide text-white/50">{room.connection}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <Input
                  value={newRoomTitle}
                  onChange={(event) => setNewRoomTitle(event.target.value)}
                  placeholder="New room title"
                />
                <Input
                  value={newRoomService}
                  onChange={(event) => setNewRoomService(event.target.value)}
                  placeholder="service name (optional)"
                />
                <Button variant="outline" onClick={() => void onCreateRoom()} disabled={busy !== null}>
                  Add Room
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-[720px]">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle>{selectedRoom?.title ?? 'Conversation'}</CardTitle>
              {connectionBadge}
            </div>
            <CardDescription>{status}</CardDescription>
            {error ? (
              <div className="rounded-xl border border-red-400/40 bg-red-500/15 px-3 py-2 text-sm text-red-100">
                {error}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 md:grid-cols-2">
              <Input value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} placeholder="Room title" />
              <Input
                value={roomService}
                onChange={(event) => setRoomService(event.target.value)}
                placeholder="Service name"
              />
              <Input
                value={roomListenAddr}
                onChange={(event) => setRoomListenAddr(event.target.value)}
                placeholder="Listen address"
              />
              <Input
                value={roomAllowedPeers}
                onChange={(event) => setRoomAllowedPeers(event.target.value)}
                placeholder="Allowed peers CSV"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <Button
                variant="outline"
                onClick={() => void onSaveSettings().catch(() => undefined)}
                disabled={busy !== null}
              >
                Save
              </Button>
              <Button onClick={() => void onHostRoom()} disabled={busy !== null || !selectedRoomId}>
                Start Host
              </Button>
              <Button variant="secondary" onClick={() => void onJoinRoom()} disabled={busy !== null || !selectedRoomId}>
                Join Room
              </Button>
              <Button variant="ghost" onClick={() => void onDisconnectRoom()} disabled={busy !== null || !selectedRoomId}>
                Disconnect
              </Button>
            </div>

            <div className="h-[420px] overflow-y-auto rounded-2xl border border-white/10 bg-[#060d18]/85 p-3">
              <div className="space-y-2">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-sm',
                      message.system
                        ? 'border-white/10 bg-white/5 text-white/70'
                        : message.outgoing
                          ? 'border-brand-300/50 bg-brand-400/20 text-white'
                          : 'border-white/10 bg-white/[0.04] text-white/90',
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-white/55">
                      <span>{message.system ? 'system' : message.sender}</span>
                      <span>{formatTime(message.ts)}</span>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
                  </div>
                ))}
                {messages.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/15 px-3 py-6 text-center text-sm text-white/50">
                    No messages yet for this room.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Textarea
                rows={3}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write a message..."
              />
              <div className="flex justify-end">
                <Button onClick={() => void onSend()} disabled={busy !== null || !selectedRoomId}>
                  Send Message
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

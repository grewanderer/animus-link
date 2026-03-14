'use client';

import {
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';

import {
  defaultSiteLocale,
  localizeSitePath,
  parseSiteLocaleFromAnyPath,
  siteLocaleCookieName,
  stripSiteLocalePrefix,
  type SiteLocale,
} from '@/lib/site-locale';
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

type SnapshotResponse = {
  ok: boolean;
  snapshot?: MessengerSnapshot;
  error?: string;
};

type MessagesResponse = {
  ok: boolean;
  currentSeq?: number;
  messages?: MessengerMessage[];
  error?: string;
};

type ActionResponse = {
  ok: boolean;
  snapshot?: MessengerSnapshot;
  invite?: string;
  room?: MessengerRoom;
  error?: string;
};

type ProfileDraft = {
  profileName: string;
  profileAvatar: string | null;
  daemonApi: string;
};

type RoomDraft = {
  title: string;
  serviceName: string;
  listenAddr: string;
  allowedPeersCsv: string;
};

type TerminalLevel = 'info' | 'warn' | 'error';

type TerminalLine = {
  id: string;
  ts: number;
  level: TerminalLevel;
  text: string;
};

const AVATAR_MAX_BYTES = 192 * 1024;
const SNAPSHOT_POLL_MS = 5000;
const MESSAGE_POLL_MS = 1200;
const MAX_TERMINAL_LINES = 240;
const ADVANCED_UI_ENABLED = process.env.NEXT_PUBLIC_MESSENGER_ADVANCED_UI === '1';
const DEV_UI_ENABLED = process.env.NEXT_PUBLIC_MESSENGER_DEV_UI === '1';
const SHOW_ADVANCED_UI = ADVANCED_UI_ENABLED || DEV_UI_ENABLED;
const MESSENGER_SITE_LOCALES: SiteLocale[] = ['en', 'ru'];

const TIME_SHORT = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const TIME_FULL = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

function roomToDraft(room: MessengerRoom): RoomDraft {
  return {
    title: room.title,
    serviceName: room.serviceName,
    listenAddr: room.listenAddr,
    allowedPeersCsv: room.allowedPeersCsv,
  };
}

function formatShortTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) {
    return '--:--';
  }
  return TIME_SHORT.format(new Date(ts * 1000));
}

function formatFullTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) {
    return '--:--:--';
  }
  return TIME_FULL.format(new Date(ts * 1000));
}

function statusMeta(room: MessengerRoom): { label: string; tone: 'idle' | 'live' | 'warn' } {
  if (room.connection === 'host' && room.connected) {
    return { label: 'HOST', tone: 'live' };
  }
  if (room.connection === 'joined' && room.connected) {
    return { label: 'JOINED', tone: 'live' };
  }
  if (room.connection !== 'idle' && !room.connected) {
    return { label: 'CONNECTING', tone: 'warn' };
  }
  return { label: 'IDLE', tone: 'idle' };
}

function statusToneClass(tone: 'idle' | 'live' | 'warn', dark: boolean): string {
  if (tone === 'live') {
    return dark
      ? 'border-emerald-300/50 bg-emerald-300/15 text-emerald-200'
      : 'border-emerald-500/45 bg-emerald-100 text-emerald-700';
  }
  if (tone === 'warn') {
    return dark
      ? 'border-amber-300/50 bg-amber-300/15 text-amber-200'
      : 'border-amber-500/45 bg-amber-100 text-amber-700';
  }
  return dark
    ? 'border-amber-200/25 bg-amber-100/10 text-amber-100/80'
    : 'border-slate-400/45 bg-slate-100 text-slate-700';
}

function explainError(errorText: string): string {
  const normalized = errorText.trim();
  if (normalized.includes('service already exposed')) {
    return 'This service is already exposed. Click Disconnect on host or adjust room settings.';
  }
  if (normalized.includes('room is not connected')) {
    return 'Room is not connected. Click Start Host or Join Room.';
  }
  if (normalized.includes('missing field')) {
    return 'A required field is missing.';
  }
  return normalized || 'Unknown error';
}

function initials(name: string): string {
  const value = name.trim();
  if (!value) {
    return '?';
  }
  return value[0]!.toUpperCase();
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function AvatarCircle({
  src,
  name,
  size,
  className,
}: {
  src: string | null;
  name: string;
  size: number;
  className?: string;
}) {
  return (
    <div
      className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border', className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${name} avatar`} className="h-full w-full object-cover" />
      ) : (
        <span className="text-sm font-semibold">{initials(name)}</span>
      )}
    </div>
  );
}

function RadioKnob({
  title,
  leftLabel,
  rightLabel,
  activeRight,
  onClick,
  className,
}: {
  title: string;
  leftLabel: string;
  rightLabel: string;
  activeRight: boolean;
  onClick: () => void;
  className?: string;
}) {
  const angle = activeRight ? 42 : -42;

  return (
    <div className={cn('flex w-[112px] flex-col items-center gap-2.5', className)}>
      <div className="text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-[#cbb487]">
        {title}
      </div>
      <button
        type="button"
        onClick={onClick}
        aria-label={`${title}: ${activeRight ? rightLabel : leftLabel}`}
        className="group relative flex h-[112px] w-[112px] items-center justify-center rounded-full border border-[#8c6b35] bg-[radial-gradient(circle_at_35%_28%,#5b4730_0%,#2a1c11_45%,#140d08_100%)] shadow-[inset_0_2px_0_rgba(255,223,164,0.18),inset_0_-8px_18px_rgba(0,0,0,0.45),0_16px_28px_rgba(0,0,0,0.4)] transition-transform duration-200 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-amber-300/65"
      >
        <span className="absolute inset-[10px] rounded-full border border-[#5f4725] bg-[radial-gradient(circle_at_30%_28%,#3d2e1d_0%,#1a120c_65%,#100905_100%)] shadow-[inset_0_0_0_1px_rgba(255,222,162,0.06)]" />
        <span
          className="absolute h-[40px] w-[5px] rounded-full bg-[linear-gradient(180deg,#f7d98b,#9c6d2d)] shadow-[0_0_12px_rgba(244,200,106,0.25)] transition-transform duration-300"
          style={{ transform: `translateY(-25px) rotate(${angle}deg)` }}
        />
        <span className="absolute inset-[33px] rounded-full border border-[#7d6132] bg-[radial-gradient(circle_at_35%_30%,#4d3b26_0%,#24180f_72%,#16100a_100%)] shadow-[inset_0_1px_0_rgba(255,228,174,0.15)]" />
        <span className="absolute inset-[43px] rounded-full border border-[#917140] bg-[radial-gradient(circle_at_35%_30%,#765a34_0%,#412c18_78%,#2a1a0e_100%)]" />
      </button>
      <div className="flex w-full items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-[0.08em]">
        <span className={cn(activeRight ? 'text-[#8d7753]' : 'text-[#f1d89d]')}>{leftLabel}</span>
        <span className={cn(activeRight ? 'text-[#f1d89d]' : 'text-[#8d7753]')}>{rightLabel}</span>
      </div>
    </div>
  );
}

function KnobPod({
  side,
  children,
  className,
}: {
  side: 'left' | 'right';
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative border border-[#7d5f30] bg-[linear-gradient(145deg,#342417,#21150d)] shadow-[inset_0_1px_0_rgba(255,220,160,0.15),0_28px_40px_rgba(0,0,0,0.28)]",
        "before:pointer-events-none before:absolute before:inset-[10px] before:rounded-[24px] before:border before:border-amber-100/10",
        side === 'left'
          ? 'rounded-[38px_30px_30px_38px] px-5 py-5 pr-6'
          : 'rounded-[30px_38px_38px_30px] px-5 py-5 pl-6',
        className,
      )}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function RadioClockDisplay({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const glyphs = value.split('');

  return (
    <div
      className={cn(
        'relative w-[278px] rounded-[34px] border border-[#7d5f30] bg-[linear-gradient(145deg,#39271a,#24170e)] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,220,160,0.15),0_30px_44px_rgba(0,0,0,0.28)]',
        'before:pointer-events-none before:absolute before:inset-[10px] before:rounded-[24px] before:border before:border-amber-100/10',
        className,
      )}
    >
      <div className="relative z-10">
        <div className="mb-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-[#cbb487]">
          <span>Clock</span>
          <span>Local</span>
        </div>

        <div className="rounded-[24px] border border-[#6f8740]/60 bg-[linear-gradient(180deg,#182014,#10150d)] p-4 shadow-[inset_0_0_0_1px_rgba(170,220,116,0.1),inset_0_0_26px_rgba(125,170,84,0.08)]">
          <div className="flex items-center justify-center gap-2">
            {glyphs.map((char, index) =>
              char === ':' ? (
                <div key={`colon-${index}`} className="flex h-[72px] flex-col items-center justify-center gap-3 px-1">
                  <span className="size-2 rounded-full bg-[#dbff98] shadow-[0_0_10px_rgba(219,255,152,0.8)]" />
                  <span className="size-2 rounded-full bg-[#dbff98] shadow-[0_0_10px_rgba(219,255,152,0.8)]" />
                </div>
              ) : (
                <div
                  key={`digit-${index}-${char}`}
                  className="flex h-[72px] w-[46px] items-center justify-center rounded-[14px] border border-[#799147]/65 bg-[linear-gradient(180deg,rgba(25,36,16,0.96),rgba(12,17,9,0.98))] font-mono text-[40px] font-bold leading-none text-[#e8ffb6] shadow-[inset_0_0_12px_rgba(163,224,105,0.08)]"
                >
                  <span className="drop-shadow-[0_0_12px_rgba(216,255,144,0.55)]">{char}</span>
                </div>
              ),
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.18em] text-[#96b26e]">
            <span>Animus</span>
            <span>24H Sync</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <span className="inline-block h-2.5 w-7 rounded-full border border-[#7b6438] bg-[linear-gradient(180deg,#2b361d,#11170d)]" />
          <span className="inline-block h-2.5 w-7 rounded-full border border-[#7b6438] bg-[linear-gradient(180deg,#63823d,#2e471c)] shadow-[0_0_10px_rgba(151,205,93,0.18)]" />
          <span className="inline-block h-2.5 w-7 rounded-full border border-[#7b6438] bg-[linear-gradient(180deg,#3a2620,#1b110d)]" />
        </div>
      </div>
    </div>
  );
}

function ExternalScrollArea({
  children,
  className,
  viewportClassName,
}: {
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startY: number; startScrollTop: number } | null>(null);
  const [metrics, setMetrics] = useState({ scrollable: false, thumbHeight: 0, thumbTop: 0 });

  const syncMetrics = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) {
      return;
    }

    const viewportHeight = viewport.clientHeight;
    const scrollHeight = viewport.scrollHeight;
    const trackHeight = track.clientHeight;
    const maxScroll = Math.max(0, scrollHeight - viewportHeight);
    const scrollable = maxScroll > 1 && viewportHeight > 0 && trackHeight > 0;

    if (!scrollable) {
      setMetrics((prev) =>
        prev.scrollable || prev.thumbHeight !== 0 || prev.thumbTop !== 0
          ? { scrollable: false, thumbHeight: 0, thumbTop: 0 }
          : prev,
      );
      return;
    }

    const thumbHeight = Math.max(32, (viewportHeight / scrollHeight) * trackHeight);
    const thumbTop = (viewport.scrollTop / maxScroll) * (trackHeight - thumbHeight);

    setMetrics((prev) => {
      if (
        prev.scrollable === scrollable &&
        Math.abs(prev.thumbHeight - thumbHeight) < 0.5 &&
        Math.abs(prev.thumbTop - thumbTop) < 0.5
      ) {
        return prev;
      }
      return { scrollable, thumbHeight, thumbTop };
    });
  }, []);

  useEffect(() => {
    syncMetrics();
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport) {
      return;
    }

    const onScroll = () => syncMetrics();
    viewport.addEventListener('scroll', onScroll, { passive: true });

    if (typeof ResizeObserver === 'undefined') {
      return () => viewport.removeEventListener('scroll', onScroll);
    }

    const observer = new ResizeObserver(() => syncMetrics());
    observer.observe(viewport);
    if (content) {
      observer.observe(content);
    }

    return () => {
      viewport.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [syncMetrics]);

  const handleTrackPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track || !metrics.scrollable) {
      return;
    }
    const rect = track.getBoundingClientRect();
    const offset = Math.min(Math.max(0, event.clientY - rect.top), rect.height);
    const ratio = rect.height > 0 ? offset / rect.height : 0;
    viewport.scrollTop = ratio * (viewport.scrollHeight - viewport.clientHeight);
  }, [metrics.scrollable]);

  const handleThumbPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track || !metrics.scrollable) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    dragStateRef.current = {
      startY: event.clientY,
      startScrollTop: viewport.scrollTop,
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      const drag = dragStateRef.current;
      const nextViewport = viewportRef.current;
      const nextTrack = trackRef.current;
      if (!drag || !nextViewport || !nextTrack) {
        return;
      }

      const trackTravel = Math.max(1, nextTrack.clientHeight - metrics.thumbHeight);
      const scrollTravel = Math.max(1, nextViewport.scrollHeight - nextViewport.clientHeight);
      const deltaY = moveEvent.clientY - drag.startY;
      nextViewport.scrollTop = drag.startScrollTop + (deltaY / trackTravel) * scrollTravel;
    };

    const onPointerUp = () => {
      dragStateRef.current = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [metrics.scrollable, metrics.thumbHeight]);

  return (
    <div className={cn('grid min-h-0 grid-cols-[minmax(0,1fr)_8px] items-stretch gap-1.5', className)}>
      <div
        ref={viewportRef}
        className={cn('messenger-native-scroll-hidden min-h-0 overflow-y-auto', viewportClassName)}
      >
        <div ref={contentRef}>{children}</div>
      </div>

      <div
        ref={trackRef}
        className={cn(
          'messenger-external-rail',
          metrics.scrollable ? 'opacity-100' : 'opacity-35',
        )}
        onPointerDown={handleTrackPointerDown}
      >
        {metrics.scrollable ? (
          <div
            className="messenger-external-thumb"
            style={{ height: `${metrics.thumbHeight}px`, transform: `translateY(${metrics.thumbTop}px)` }}
            onPointerDown={handleThumbPointerDown}
          />
        ) : null}
      </div>
    </div>
  );
}

export function MessengerApp() {
  const pathname = usePathname() ?? '/link';
  const [snapshot, setSnapshot] = useState<MessengerSnapshot | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);

  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({
    profileName: 'user',
    profileAvatar: null,
    daemonApi: 'http://127.0.0.1:9999',
  });
  const [profileDirty, setProfileDirty] = useState(false);
  const [daemonDirty, setDaemonDirty] = useState(false);

  const [roomDraft, setRoomDraft] = useState<RoomDraft>({
    title: '',
    serviceName: '',
    listenAddr: '',
    allowedPeersCsv: '',
  });
  const [roomDirty, setRoomDirty] = useState(false);

  const [inviteDraft, setInviteDraft] = useState('');
  const [composer, setComposer] = useState('');
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [newRoomService, setNewRoomService] = useState('');
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const snapshotRef = useRef<MessengerSnapshot | null>(null);
  const seenSystemSeqRef = useRef<Record<string, number>>({});

  const shellDark = theme === 'dark';
  const currentLocale = parseSiteLocaleFromAnyPath(pathname) ?? defaultSiteLocale;
  const messengerLocale = currentLocale === 'ru' ? 'ru' : 'en';

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    html.classList.add('messenger-route');
    body.classList.add('messenger-route');

    return () => {
      html.classList.remove('messenger-route');
      body.classList.remove('messenger-route');
    };
  }, []);

  const activeRoom = useMemo(() => {
    if (!snapshot || snapshot.rooms.length === 0) {
      return null;
    }
    if (!activeRoomId) {
      return snapshot.rooms[0] ?? null;
    }
    return snapshot.rooms.find((room) => room.id === activeRoomId) ?? snapshot.rooms[0] ?? null;
  }, [activeRoomId, snapshot]);

  const activeRoomMessages = activeRoom?.messages ?? [];
  const visibleRoomMessages = useMemo(
    () => activeRoomMessages.filter((message) => !message.system),
    [activeRoomMessages],
  );
  const activeStatus = activeRoom ? statusMeta(activeRoom) : { label: 'IDLE', tone: 'idle' as const };

  const handleLocaleSwitch = useCallback(
    (nextLocale: SiteLocale) => {
      if (nextLocale === currentLocale || typeof window === 'undefined') {
        return;
      }
      const basePath = stripSiteLocalePrefix(pathname).pathname;
      const target = localizeSitePath(nextLocale, basePath);
      document.cookie = `${siteLocaleCookieName}=${encodeURIComponent(nextLocale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
      window.location.assign(target);
    },
    [currentLocale, pathname],
  );

  const pushTerminal = useCallback((level: TerminalLevel, text: string) => {
    setTerminalLines((prev) => [...prev, { id: id('term'), ts: Date.now(), level, text }].slice(-MAX_TERMINAL_LINES));
  }, []);

  const applySnapshot = useCallback((next: MessengerSnapshot) => {
    setSnapshot(next);
    setActiveRoomId((prev) => {
      if (next.rooms.length === 0) {
        return null;
      }
      if (prev && next.rooms.some((room) => room.id === prev)) {
        return prev;
      }
      return next.rooms[0]?.id ?? null;
    });
  }, []);

  const loadSnapshot = useCallback(
    async (mode: 'initial' | 'poll') => {
      const response = await fetch('/api/messenger', { cache: 'no-store' });
      const data = (await response.json()) as SnapshotResponse;
      if (!response.ok || !data.ok || !data.snapshot) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      applySnapshot(data.snapshot);
      if (mode === 'initial') {
        pushTerminal('info', 'Messenger state loaded');
      }
    },
    [applySnapshot, pushTerminal],
  );

  const mergeRoomMessages = useCallback((roomId: string, currentSeq: number, messages: MessengerMessage[]) => {
    setSnapshot((prev) => {
      if (!prev) {
        return prev;
      }
      let changed = false;
      const rooms = prev.rooms.map((room) => {
        if (room.id !== roomId) {
          return room;
        }
        const known = new Set(room.messages.map((message) => message.seq));
        const appended = messages.filter((message) => !known.has(message.seq));
        const nextMessages = appended.length ? [...room.messages, ...appended].slice(-240) : room.messages;
        const nextSeq = Number.isFinite(currentSeq) ? Math.max(room.currentSeq, currentSeq) : room.currentSeq;
        if (nextMessages !== room.messages || nextSeq !== room.currentSeq) {
          changed = true;
          return { ...room, currentSeq: nextSeq, messages: nextMessages };
        }
        return room;
      });
      return changed ? { ...prev, rooms } : prev;
    });
  }, []);

  const pollActiveRoomMessages = useCallback(async () => {
    const current = snapshotRef.current;
    if (!current || !activeRoomId) {
      return;
    }
    const room = current.rooms.find((candidate) => candidate.id === activeRoomId);
    if (!room) {
      return;
    }
    const response = await fetch(`/api/messenger?roomId=${room.id}&afterSeq=${room.currentSeq}`, {
      cache: 'no-store',
    });
    const data = (await response.json()) as MessagesResponse;
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    if (typeof data.currentSeq !== 'number') {
      return;
    }
    mergeRoomMessages(room.id, data.currentSeq, Array.isArray(data.messages) ? data.messages : []);
  }, [activeRoomId, mergeRoomMessages]);

  const callAction = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      setBusyAction(action);
      setError(null);
      setNotice(null);
      try {
        const response = await fetch('/api/messenger', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, payload }),
        });
        const data = (await response.json()) as ActionResponse;
        if (!response.ok || !data.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }
        if (data.snapshot) {
          applySnapshot(data.snapshot);
        }
        return data;
      } catch (cause) {
        const message = explainError(cause instanceof Error ? cause.message : 'request failed');
        setError(message);
        pushTerminal('error', message);
        throw cause;
      } finally {
        setBusyAction(null);
      }
    },
    [applySnapshot, pushTerminal],
  );

  const persistRoomDraft = useCallback(async () => {
    if (!activeRoom || !roomDirty) {
      return;
    }
    await callAction('update_room', {
      roomId: activeRoom.id,
      title: roomDraft.title,
      serviceName: roomDraft.serviceName,
      listenAddr: roomDraft.listenAddr,
      allowedPeersCsv: roomDraft.allowedPeersCsv,
    });
    setRoomDirty(false);
  }, [activeRoom, callAction, roomDraft, roomDirty]);

  const handleProfileSave = useCallback(async () => {
    await callAction('update_settings', {
      profileName: profileDraft.profileName,
      profileAvatar: profileDraft.profileAvatar,
    });
    setProfileDirty(false);
    setProfileEditorOpen(false);
    setNotice('Profile saved');
  }, [callAction, profileDraft]);

  const handleDaemonSave = useCallback(async () => {
    await callAction('update_settings', {
      daemonApi: profileDraft.daemonApi,
    });
    setDaemonDirty(false);
    setNotice('Daemon API saved');
  }, [callAction, profileDraft.daemonApi]);

  const handleCreateInvite = useCallback(async () => {
    const result = await callAction('invite_create');
    if (typeof result.invite !== 'string' || !result.invite) {
      throw new Error('invite is missing');
    }
    setInviteDraft(result.invite);
    setNotice('Invite created');
  }, [callAction]);

  const handleJoinInvite = useCallback(async () => {
    const invite = inviteDraft.trim();
    if (!invite) {
      setError('Enter invite code');
      return;
    }
    await callAction('invite_join', { invite });
    setNotice('Invite accepted');
  }, [callAction, inviteDraft]);

  const handleCreateRoom = useCallback(async () => {
    const result = await callAction('create_room', { title: newRoomTitle, serviceName: newRoomService });
    setNewRoomTitle('');
    setNewRoomService('');
    if (result.room?.id) {
      setActiveRoomId(result.room.id);
    }
    setNotice('Chat added');
  }, [callAction, newRoomService, newRoomTitle]);

  const handleDeleteRoom = useCallback(async () => {
    if (!activeRoom) {
      return;
    }
    if (!window.confirm(`Delete chat "${activeRoom.title}"?`)) {
      return;
    }
    await callAction('delete_room', { roomId: activeRoom.id });
    setNotice('Chat deleted');
  }, [activeRoom, callAction]);

  const handleHostRoom = useCallback(async () => {
    if (!activeRoom) {
      return;
    }
    await persistRoomDraft();
    await callAction('host_room', { roomId: activeRoom.id });
    setNotice('Host mode enabled');
  }, [activeRoom, callAction, persistRoomDraft]);

  const handleJoinRoom = useCallback(async () => {
    if (!activeRoom) {
      return;
    }
    await persistRoomDraft();
    await callAction('join_room', { roomId: activeRoom.id });
    setNotice('Room join started');
  }, [activeRoom, callAction, persistRoomDraft]);

  const handleDisconnectRoom = useCallback(async () => {
    if (!activeRoom) {
      return;
    }
    await callAction('disconnect_room', { roomId: activeRoom.id });
    setNotice('Room disconnected');
  }, [activeRoom, callAction]);

  const handleSendMessage = useCallback(async () => {
    if (!activeRoom) {
      return;
    }
    const text = composer.trim();
    if (!text) {
      return;
    }
    await callAction('send_message', { roomId: activeRoom.id, text });
    setComposer('');
  }, [activeRoom, callAction, composer]);

  const handleComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey) {
        return;
      }
      event.preventDefault();
      void handleSendMessage().catch(() => {});
    },
    [handleSendMessage],
  );

  const handleAvatarFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Avatar file must be an image');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setError('Maximum avatar size is 192 KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setError('Could not read selected file');
        return;
      }
      setProfileDraft((prev) => ({ ...prev, profileAvatar: reader.result }));
      setProfileDirty(true);
    };
    reader.onerror = () => setError('Could not read selected file');
    reader.readAsDataURL(file);
  }, []);

  const handleProfileEditCancel = useCallback(() => {
    const current = snapshotRef.current;
    setProfileEditorOpen(false);
    setProfileDirty(false);
    if (!current) {
      return;
    }
    setProfileDraft((prev) => ({
      ...prev,
      profileName: current.profileName,
      profileAvatar: current.profileAvatar,
    }));
  }, []);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        await loadSnapshot('initial');
      } catch (cause) {
        if (!cancelled) {
          setError(explainError(cause instanceof Error ? cause.message : 'snapshot load failed'));
        }
      } finally {
        if (!cancelled) {
          setLoadingInitial(false);
        }
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadSnapshot]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadSnapshot('poll').catch((cause) => {
        pushTerminal('warn', explainError(cause instanceof Error ? cause.message : 'poll failed'));
      });
    }, SNAPSHOT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadSnapshot, pushTerminal]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void pollActiveRoomMessages().catch((cause) => {
        pushTerminal('warn', explainError(cause instanceof Error ? cause.message : 'message poll failed'));
      });
    }, MESSAGE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [pollActiveRoomMessages, pushTerminal]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!snapshot || profileDirty || daemonDirty) {
      return;
    }
    setProfileDraft({
      profileName: snapshot.profileName,
      profileAvatar: snapshot.profileAvatar,
      daemonApi: snapshot.daemonApi,
    });
  }, [daemonDirty, profileDirty, snapshot]);

  useEffect(() => {
    if (activeRoom && !roomDirty) {
      setRoomDraft(roomToDraft(activeRoom));
    }
  }, [activeRoom, roomDirty]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    const nextSeen: Record<string, number> = {};
    for (const room of snapshot.rooms) {
      const previousSeen = seenSystemSeqRef.current[room.id] ?? 0;
      const systemMessages = room.messages.filter((message) => message.system);
      for (const message of systemMessages.filter((message) => message.seq > previousSeen)) {
        pushTerminal('info', `[${room.title}] ${message.text}`);
      }
      const latest = systemMessages[systemMessages.length - 1];
      nextSeen[room.id] = latest ? latest.seq : previousSeen;
    }
    seenSystemSeqRef.current = nextSeen;
  }, [pushTerminal, snapshot]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [activeRoomId, visibleRoomMessages.length]);

  const shell = cn(
    'relative z-10 flex flex-col overflow-hidden rounded-[42px] border p-4 sm:p-6',
    shellDark
      ? 'border-[#7d5f30] bg-[linear-gradient(145deg,#2b1f14,#1d130b)] text-[#f7e6bf] shadow-[0_42px_90px_rgba(0,0,0,0.58)]'
      : 'border-[#a3906f] bg-[linear-gradient(145deg,#f1eadc,#e4d6bc)] text-[#302714] shadow-[0_34px_80px_rgba(74,56,20,0.24)]',
  );
  const panel = cn(
    'rounded-[30px] border p-4 shadow-[inset_0_1px_0_rgba(255,220,160,0.15),0_20px_35px_rgba(0,0,0,0.2)]',
    shellDark
      ? 'border-[#856833] bg-[linear-gradient(145deg,#332316,#24180f)]'
      : 'border-[#aa956e] bg-[linear-gradient(145deg,#efe5d2,#e2d3b6)]',
  );
  const screen = cn(
    'rounded-[22px] border p-3',
    shellDark
      ? 'border-[#6a542d] bg-[linear-gradient(180deg,#121c16,#15201a)] text-[#d8f8cc] shadow-[inset_0_0_0_1px_rgba(144,195,112,0.08)]'
      : 'border-[#99ad92] bg-[linear-gradient(180deg,#eef7ea,#e2efde)] text-[#2f4b2f] shadow-[inset_0_0_0_1px_rgba(130,164,112,0.2)]',
  );
  const inputClass = cn(
    'w-full rounded-2xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2',
    shellDark
      ? 'border-[#7a6136] bg-[#17110b] text-[#f8e6c0] placeholder:text-[#a79068] focus:ring-amber-300/70'
      : 'border-[#b39f78] bg-[#f8f2e6] text-[#3a2f1e] placeholder:text-[#8b7650] focus:ring-amber-600/55',
  );
  const textDim = shellDark ? 'text-[#dac9a3]/80' : 'text-[#5f4c35]/80';
  const buttonBase =
    'inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] disabled:cursor-not-allowed';
  const buttonPrimary = cn(
    buttonBase,
    shellDark
      ? 'border-[#d4ad5a] bg-[linear-gradient(180deg,#f4c86a,#c18935)] text-[#2b1804] disabled:opacity-45'
      : 'border-[#9f7d3f] bg-[linear-gradient(180deg,#f5d38a,#d29b45)] text-[#2c1b07] disabled:opacity-45',
  );
  const buttonSoft = cn(
    buttonBase,
    shellDark
      ? 'border-[#7f6236] bg-[#1c120b] text-[#f3deb5] disabled:opacity-45'
      : 'border-[#ab9468] bg-[#efe2cb] text-[#46331b] disabled:opacity-45',
  );

  return (
    <main
      className={cn(
        'h-[100dvh] min-h-[100dvh] w-full overflow-hidden px-3 py-4 sm:px-6 sm:py-6',
        shellDark ? 'messenger-theme-dark' : 'messenger-theme-light',
        shellDark
          ? 'bg-[radial-gradient(circle_at_15%_10%,rgba(255,175,78,0.12),transparent_35%),linear-gradient(180deg,#0c0805,#050403)]'
          : 'bg-[radial-gradient(circle_at_15%_10%,rgba(249,220,152,0.38),transparent_38%),linear-gradient(180deg,#ece6d9,#ddd0b8)]',
      )}
    >
      <div className="relative mx-auto grid h-full max-w-[1920px] grid-cols-1 2xl:grid-cols-[360px_minmax(0,1fr)_220px] 2xl:gap-x-10">
        <aside className="relative hidden min-h-0 flex-col items-center justify-between py-10 2xl:flex">
          <RadioClockDisplay value={formatShortTime(clockNow / 1000)} className="mt-4" />

          <KnobPod side="left" className="mb-2">
            <div className="flex items-start gap-5">
              <RadioKnob
                title="Settings"
                leftLabel="Off"
                rightLabel="On"
                activeRight={settingsOpen}
                onClick={() => setSettingsOpen((prev) => !prev)}
              />
              <RadioKnob
                title="Profile"
                leftLabel="Off"
                rightLabel="On"
                activeRight={profileEditorOpen}
                onClick={() => setProfileEditorOpen((prev) => !prev)}
              />
            </div>
          </KnobPod>
        </aside>

        <section
          className={cn(
            shell,
            'h-full min-h-0',
          )}
        >
          <h1 className="mb-4 text-center text-sm font-semibold uppercase tracking-[0.18em]">
            Animus Link
          </h1>

          <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div
              className={cn(
                'rounded-full border px-3 py-2',
                shellDark
                  ? 'border-amber-200/25 bg-black/20'
                  : 'border-slate-500/35 bg-white/35',
              )}
            >
              <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em]">
                <span>Tuner</span>
                <span className="2xl:hidden">{formatFullTime(clockNow / 1000)}</span>
                <span className="hidden 2xl:inline text-[#c7dca4]">Link band</span>
              </div>
              <div
                className={cn(
                  'h-2.5 rounded-full border',
                  shellDark
                    ? 'border-amber-300/25 bg-[linear-gradient(90deg,#213e2e_0%,#7cab6b_28%,#bcd88d_50%,#7cab6b_72%,#213e2e_100%)]'
                    : 'border-emerald-700/20 bg-[linear-gradient(90deg,#a8cf9f_0%,#d5e9c5_50%,#a8cf9f_100%)]',
                )}
              />
            </div>
            <div
              className={cn(
                'flex items-center gap-1 rounded-full border px-2 py-1 2xl:hidden',
                shellDark
                  ? 'border-amber-200/25 bg-black/20'
                  : 'border-slate-500/35 bg-white/35',
              )}
            >
              {MESSENGER_SITE_LOCALES.map((locale) => {
                const active = locale === currentLocale;
                return (
                  <button
                    key={locale}
                    type="button"
                    className={cn(
                      'rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]',
                      active
                        ? shellDark
                          ? 'border-amber-300/55 bg-amber-300/15 text-amber-50'
                          : 'border-amber-600/45 bg-amber-100 text-amber-900'
                        : shellDark
                          ? 'border-amber-100/15 bg-transparent text-amber-100/70'
                          : 'border-slate-400/30 bg-transparent text-slate-700/75',
                    )}
                    onClick={() => handleLocaleSwitch(locale)}
                      >
                        {locale}
                      </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 self-center">
              <span
                className={cn(
                  'inline-block size-4 rounded-full border',
                  shellDark ? 'border-amber-300/40 bg-amber-300/20' : 'border-amber-700/40 bg-amber-300/45',
                )}
              />
              <span
                className={cn(
                  'inline-block size-4 rounded-full border',
                  shellDark ? 'border-lime-300/40 bg-lime-300/20' : 'border-lime-700/40 bg-lime-300/45',
                )}
              />
              <span
                className={cn(
                  'inline-block size-4 rounded-full border',
                  shellDark ? 'border-red-300/40 bg-red-300/20' : 'border-red-700/40 bg-red-300/45',
                )}
              />
            </div>
          </div>

          {error ? (
            <div className="mb-2 rounded-2xl border border-red-500/45 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {notice ? (
            <div
              className={cn(
                'mb-2 rounded-2xl border px-4 py-3 text-sm',
                shellDark
                  ? 'border-emerald-300/45 bg-emerald-300/10 text-emerald-200'
                  : 'border-emerald-500/45 bg-emerald-100 text-emerald-700',
              )}
            >
              {notice}
            </div>
          ) : null}

          {loadingInitial && !snapshot ? (
            <div className={cn(panel, textDim)}>Loading messenger...</div>
          ) : null}

          {snapshot ? (
            <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <aside className="flex min-h-0 flex-col gap-4 overflow-hidden">
                <button
                  type="button"
                  className={cn(buttonSoft, 'self-start')}
                  onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                >
                  Dark/Light
                </button>

                <section
                  aria-label="User panel"
                  className={cn(panel, 'flex min-h-0 flex-1 flex-col')}
                >
                  <div className={cn(screen, 'flex min-h-0 flex-1 flex-col gap-3')}>
                    <div className="flex flex-col items-center gap-2 border-b border-current/15 pb-3">
                      <AvatarCircle
                        src={profileDraft.profileAvatar}
                        name={profileDraft.profileName}
                        size={92}
                        className={cn(
                          shellDark
                            ? 'border-[#8fb171]/45 bg-[#182217] text-[#dff8d0]'
                            : 'border-[#90a98f] bg-[#eaf5e8] text-[#325139]',
                        )}
                      />
                      <p className="max-w-full truncate text-base font-semibold">
                        {profileDraft.profileName || 'user'}
                      </p>
                      <button
                        type="button"
                        className={cn(buttonSoft, 'px-3 py-1.5 text-[11px] 2xl:hidden')}
                        onClick={() => setProfileEditorOpen((prev) => !prev)}
                      >
                        {profileEditorOpen ? 'Close Edit' : 'Edit Profile'}
                      </button>
                    </div>

                    <div className="messenger-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-2">
                      {snapshot.rooms.map((room) => {
                        const selected = activeRoom?.id === room.id;
                        const status = statusMeta(room);
                        return (
                          <button
                            key={room.id}
                            type="button"
                            onClick={() => {
                              setActiveRoomId(room.id);
                              setRoomDirty(false);
                            }}
                            className={cn(
                              'w-full rounded-2xl border p-2 text-left',
                              selected
                                ? shellDark
                                  ? 'border-amber-300/60 bg-amber-300/10'
                                  : 'border-amber-600/50 bg-amber-100'
                                : shellDark
                                  ? 'border-amber-100/20 bg-black/20'
                                  : 'border-slate-400/35 bg-white/45',
                            )}
                          >
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-semibold">{room.title}</span>
                              <span
                                className={cn(
                                  'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                                  statusToneClass(status.tone, shellDark),
                                )}
                              >
                                {status.label}
                              </span>
                            </div>
                            {SHOW_ADVANCED_UI ? (
                              <div className={cn('truncate text-xs', textDim)}>{room.serviceName}</div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>

                    {profileEditorOpen ? (
                      <div
                        className={cn(
                          'rounded-2xl border p-3',
                          shellDark
                            ? 'border-amber-100/20 bg-black/20'
                            : 'border-slate-400/35 bg-white/45',
                        )}
                      >
                        <div className="space-y-2.5">
                          <input
                            className={inputClass}
                            value={profileDraft.profileName}
                            onChange={(event) => {
                              setProfileDraft((prev) => ({ ...prev, profileName: event.target.value }));
                              setProfileDirty(true);
                            }}
                            placeholder="Profile name"
                          />

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={buttonSoft}
                              onClick={() => avatarInputRef.current?.click()}
                            >
                              Change Avatar
                            </button>
                            <button
                              type="button"
                              className={buttonSoft}
                              onClick={() => {
                                setProfileDraft((prev) => ({ ...prev, profileAvatar: null }));
                                setProfileDirty(true);
                              }}
                            >
                              Remove Avatar
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={buttonPrimary}
                              disabled={!profileDirty || busyAction === 'update_settings'}
                              onClick={() => void handleProfileSave().catch(() => {})}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className={buttonSoft}
                              onClick={handleProfileEditCancel}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={handleAvatarFile}
                    />
                  </div>

                  <div className="mt-3">
                    <button
                      type="button"
                      className={cn(buttonSoft, '2xl:hidden')}
                      onClick={() => setSettingsOpen((prev) => !prev)}
                    >
                      Settings
                    </button>
                  </div>
                </section>

                {settingsOpen ? (
                  <section className={cn(panel, 'min-h-0 overflow-visible xl:max-h-[42%]')}>
                    <ExternalScrollArea
                      className="h-full xl:w-[calc(100%+0.65rem)] xl:mr-[-0.65rem]"
                      viewportClassName="h-full pr-1"
                    >
                      <div className="space-y-2.5 pr-1">
                          {SHOW_ADVANCED_UI ? (
                            <div className="space-y-2">
                              <input
                                className={inputClass}
                                value={profileDraft.daemonApi}
                                onChange={(event) => {
                                  setProfileDraft((prev) => ({ ...prev, daemonApi: event.target.value }));
                                  setDaemonDirty(true);
                                }}
                                placeholder="http://127.0.0.1:9999"
                              />
                              <button
                                type="button"
                                className={buttonSoft}
                                disabled={!daemonDirty || busyAction === 'update_settings'}
                                onClick={() => void handleDaemonSave().catch(() => {})}
                              >
                                Save API
                              </button>
                            </div>
                          ) : null}

                          <textarea
                            className={cn(inputClass, 'min-h-[76px] resize-y')}
                            value={inviteDraft}
                            onChange={(event) => setInviteDraft(event.target.value)}
                            placeholder="Invite code"
                          />

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={buttonPrimary}
                              disabled={busyAction === 'invite_create'}
                              onClick={() => void handleCreateInvite().catch(() => {})}
                            >
                              Create Invite
                            </button>
                            <button
                              type="button"
                              className={buttonPrimary}
                              disabled={busyAction === 'invite_join'}
                              onClick={() => void handleJoinInvite().catch(() => {})}
                            >
                              Join Invite
                            </button>
                          </div>

                          <div className={cn('my-3 h-px', shellDark ? 'bg-amber-100/15' : 'bg-slate-400/35')} />

                          <input
                            className={inputClass}
                            value={newRoomTitle}
                            onChange={(event) => setNewRoomTitle(event.target.value)}
                            placeholder="New chat title"
                          />
                          {SHOW_ADVANCED_UI ? (
                            <input
                              className={inputClass}
                              value={newRoomService}
                              onChange={(event) => setNewRoomService(event.target.value)}
                              placeholder="Service name (optional)"
                            />
                          ) : null}

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={buttonSoft}
                              disabled={busyAction === 'create_room'}
                              onClick={() => void handleCreateRoom().catch(() => {})}
                            >
                              Add Chat
                            </button>
                            <button
                              type="button"
                              className={buttonSoft}
                              disabled={
                                !activeRoom || snapshot.rooms.length <= 1 || busyAction === 'delete_room'
                              }
                              onClick={() => void handleDeleteRoom().catch(() => {})}
                            >
                              Delete Chat
                            </button>
                          </div>
                      </div>
                    </ExternalScrollArea>
                  </section>
                ) : null}
              </aside>

              <section
                className={cn(
                  'grid min-h-0 gap-4',
                  DEV_UI_ENABLED ? 'xl:grid-rows-[minmax(0,1fr)_250px]' : undefined,
                )}
              >
                <section
                  aria-label="Chat panel"
                  className={cn(panel, 'flex min-h-0 flex-col')}
                >
                  <div
                    className={cn(
                      'rounded-[24px] border p-3',
                      shellDark ? 'border-amber-100/20 bg-black/15' : 'border-slate-400/35 bg-white/35',
                    )}
                  >
                    <div className="grid items-center gap-2 md:grid-cols-[auto_minmax(0,1fr)_auto]">
                      <AvatarCircle
                        src={profileDraft.profileAvatar}
                        name={profileDraft.profileName}
                        size={50}
                        className={cn(
                          shellDark
                            ? 'border-[#8db16f]/45 bg-[#1a2618] text-[#ddf8ce]'
                            : 'border-[#8fa88e] bg-[#eaf5e7] text-[#345239]',
                        )}
                      />

                      <div className={cn(screen, 'min-h-[66px]')}>
                        <p className="truncate text-sm font-semibold">{activeRoom?.title ?? 'Room'}</p>
                        <p className={cn('mt-1 truncate text-xs', textDim)}>
                          {activeRoom?.connected ? 'Connected' : 'Disconnected'}
                        </p>
                      </div>

                      <span
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-semibold',
                          statusToneClass(activeStatus.tone, shellDark),
                        )}
                      >
                        {activeStatus.label}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonPrimary}
                        disabled={busyAction === 'host_room'}
                        onClick={() => void handleHostRoom().catch(() => {})}
                      >
                        Start Host
                      </button>
                      <button
                        type="button"
                        className={buttonPrimary}
                        disabled={busyAction === 'join_room'}
                        onClick={() => void handleJoinRoom().catch(() => {})}
                      >
                        Join Room
                      </button>
                      <button
                        type="button"
                        className={buttonSoft}
                        disabled={busyAction === 'disconnect_room'}
                        onClick={() => void handleDisconnectRoom().catch(() => {})}
                      >
                        Disconnect
                      </button>
                      <button
                        type="button"
                        className={buttonSoft}
                        disabled={!roomDirty || busyAction === 'update_room'}
                        onClick={() => void persistRoomDraft().catch(() => {})}
                      >
                        Save Room
                      </button>
                    </div>

                    <div
                      className={cn(
                        'mt-3 grid gap-2',
                        SHOW_ADVANCED_UI ? 'md:grid-cols-2' : undefined,
                      )}
                    >
                      <input
                        className={inputClass}
                        value={roomDraft.title}
                        onChange={(event) => {
                          setRoomDraft((prev) => ({ ...prev, title: event.target.value }));
                          setRoomDirty(true);
                        }}
                        placeholder="Room title"
                      />
                      {SHOW_ADVANCED_UI ? (
                        <input
                          className={inputClass}
                          value={roomDraft.serviceName}
                          onChange={(event) => {
                            setRoomDraft((prev) => ({ ...prev, serviceName: event.target.value }));
                            setRoomDirty(true);
                          }}
                          placeholder="Service name"
                        />
                      ) : null}

                      {DEV_UI_ENABLED ? (
                        <>
                          <input
                            className={inputClass}
                            value={roomDraft.listenAddr}
                            onChange={(event) => {
                              setRoomDraft((prev) => ({ ...prev, listenAddr: event.target.value }));
                              setRoomDirty(true);
                            }}
                            placeholder="127.0.0.1:19180"
                          />
                          <input
                            className={inputClass}
                            value={roomDraft.allowedPeersCsv}
                            onChange={(event) => {
                              setRoomDraft((prev) => ({ ...prev, allowedPeersCsv: event.target.value }));
                              setRoomDirty(true);
                            }}
                            placeholder="peer-b"
                          />
                        </>
                      ) : null}
                    </div>

                    {DEV_UI_ENABLED && activeRoom?.lastError ? (
                      <p className={cn('mt-2 text-xs', shellDark ? 'text-amber-200' : 'text-amber-700')}>
                        Last room error: {activeRoom.lastError}
                      </p>
                    ) : null}
                  </div>

                  <div
                    className={cn(
                      'mt-3 flex min-h-0 flex-1 flex-col rounded-[24px] border p-3',
                      shellDark ? 'border-amber-100/20 bg-black/20' : 'border-slate-400/35 bg-white/45',
                    )}
                  >
                    <div
                      ref={messageListRef}
                      className="messenger-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-2"
                    >
                      {activeRoom ? (
                        activeRoom.connected ? (
                          visibleRoomMessages.length > 0 ? (
                            <ul className="space-y-3">
                              {visibleRoomMessages.map((message) => (
                                <li
                                  key={message.id}
                                  className={cn('flex gap-2', message.outgoing ? 'justify-end' : 'justify-start')}
                                >
                                  {!message.outgoing ? (
                                    <AvatarCircle
                                      src={message.avatar}
                                      name={message.sender}
                                      size={34}
                                      className={cn(
                                        shellDark
                                          ? 'border-[#8fb371]/40 bg-[#1a2618] text-[#ddf8ce]'
                                          : 'border-[#8fa88e] bg-[#eaf5e7] text-[#345239]',
                                      )}
                                    />
                                  ) : null}

                                  <div
                                    className={cn(
                                      'max-w-[min(70ch,84%)] rounded-2xl border px-3 py-2',
                                      message.outgoing
                                        ? shellDark
                                          ? 'border-amber-300/30 bg-amber-300/10 text-amber-50'
                                          : 'border-amber-500/40 bg-amber-100 text-amber-900'
                                        : shellDark
                                          ? 'border-amber-100/20 bg-[#15100a] text-[#f4e2c0]'
                                          : 'border-slate-400/35 bg-white text-slate-900',
                                    )}
                                  >
                                    <div className={cn('mb-1 flex items-center gap-2 text-xs', textDim)}>
                                      <span className="font-semibold">{message.sender}</span>
                                      <span>{formatShortTime(message.ts)}</span>
                                    </div>
                                    <div className="whitespace-pre-wrap break-words text-sm">
                                      {message.text}
                                    </div>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className={cn('pt-20 text-center text-sm', textDim)}>No messages yet</div>
                          )
                        ) : (
                          <div
                            className={cn(
                              'rounded-2xl border border-dashed px-4 py-12 text-center text-sm',
                              shellDark
                                ? 'border-amber-100/25 bg-black/20 text-amber-100/85'
                                : 'border-slate-400/40 bg-slate-100 text-slate-700',
                            )}
                          >
                            Join the room to see messages.
                          </div>
                        )
                      ) : (
                        <div className={cn('pt-20 text-center text-sm', textDim)}>No room selected</div>
                      )}
                    </div>
                  </div>

                  <div
                    aria-label="Message composer"
                    className={cn(
                      'mt-3 rounded-[24px] border p-3',
                      shellDark ? 'border-amber-100/20 bg-black/20' : 'border-slate-400/35 bg-white/45',
                    )}
                  >
                    <div className="flex items-end gap-2">
                      <AvatarCircle
                        src={profileDraft.profileAvatar}
                        name={profileDraft.profileName}
                        size={42}
                        className={cn(
                          shellDark
                            ? 'border-[#8db16f]/45 bg-[#1a2618] text-[#ddf8ce]'
                            : 'border-[#8fa88e] bg-[#eaf5e7] text-[#345239]',
                        )}
                      />
                      <textarea
                        className={cn(inputClass, 'min-h-[62px] flex-1 resize-y')}
                        value={composer}
                        onChange={(event) => setComposer(event.target.value)}
                        onKeyDown={handleComposerKeyDown}
                        placeholder={activeRoom?.connected ? 'Type message...' : 'Connect to a room first...'}
                        disabled={!activeRoom?.connected || busyAction === 'send_message'}
                      />
                      <button
                        type="button"
                        className={buttonPrimary}
                        disabled={
                          !composer.trim() || !activeRoom?.connected || busyAction === 'send_message'
                        }
                        onClick={() => void handleSendMessage().catch(() => {})}
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </section>

                {DEV_UI_ENABLED ? (
                  <section className={cn(panel, 'flex min-h-0 flex-col')}>
                    <h3 className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.1em]">
                      SSH_Terminal
                    </h3>
                    <ExternalScrollArea
                      className="min-h-0 flex-1 xl:w-[calc(100%+0.65rem)] xl:mr-[-0.65rem]"
                      viewportClassName={cn(
                        'h-full rounded-[22px] border p-3 pr-4 font-mono text-xs',
                        shellDark
                          ? 'border-amber-100/20 bg-[#0f0b06] text-[#f1ddb5]'
                          : 'border-slate-400/35 bg-[#faf7f0] text-[#3d3222]',
                      )}
                    >
                        {terminalLines.length === 0 ? (
                          <div className={textDim}>No logs yet</div>
                        ) : (
                          <ul className="space-y-1.5">
                            {terminalLines.map((line) => (
                              <li key={line.id} className="flex gap-2">
                                <span className={cn('shrink-0', textDim)}>
                                  [{formatFullTime(line.ts / 1000)}]
                                </span>
                                <span
                                  className={cn(
                                    'shrink-0 uppercase',
                                    line.level === 'error'
                                      ? shellDark
                                        ? 'text-red-300'
                                        : 'text-red-700'
                                      : line.level === 'warn'
                                        ? shellDark
                                          ? 'text-amber-300'
                                          : 'text-amber-700'
                                        : shellDark
                                          ? 'text-lime-300'
                                          : 'text-emerald-700',
                                  )}
                                >
                                  {line.level}
                                </span>
                                <span className="break-words">{line.text}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                    </ExternalScrollArea>
                  </section>
                ) : null}
              </section>
            </div>
          ) : null}
        </section>

        <aside className="relative hidden min-h-0 items-end justify-start pb-8 pl-3 2xl:flex">
          <KnobPod side="right">
            <RadioKnob
              title="Language"
              leftLabel="EN"
              rightLabel="RU"
              activeRight={messengerLocale === 'ru'}
              onClick={() => handleLocaleSwitch(messengerLocale === 'ru' ? 'en' : 'ru')}
            />
          </KnobPod>
        </aside>
      </div>
    </main>
  );
}

import { NextResponse } from 'next/server';

import { getMessengerRuntime } from '@/lib/messenger/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MessengerRequest = {
  action?: unknown;
  payload?: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseAfterSeq(value: string | null): number {
  if (!value) {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

export async function GET(request: Request) {
  const runtimeState = getMessengerRuntime();
  const { searchParams } = new URL(request.url);
  const roomId = asString(searchParams.get('roomId'));
  if (!roomId) {
    return NextResponse.json({ ok: true, snapshot: runtimeState.snapshot() }, { status: 200 });
  }

  try {
    const afterSeq = parseAfterSeq(searchParams.get('afterSeq'));
    const messages = runtimeState.roomMessages(roomId, afterSeq);
    return NextResponse.json({ ok: true, ...messages }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  let parsed: MessengerRequest;
  try {
    parsed = (await request.json()) as MessengerRequest;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  const action = asString(parsed.action);
  if (!action) {
    return NextResponse.json({ ok: false, error: 'missing action' }, { status: 400 });
  }

  const payload =
    typeof parsed.payload === 'object' && parsed.payload !== null
      ? (parsed.payload as Record<string, unknown>)
      : {};

  try {
    const runtimeState = getMessengerRuntime();
    const result = await runtimeState.handleAction(action, payload);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

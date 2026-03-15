export interface PollingStreamOptions<T> {
  intervalMs: number;
  run: () => Promise<T>;
  onData: (value: T) => void;
  onError?: (error: unknown) => void;
}

export function createPollingStream<T>({
  intervalMs,
  run,
  onData,
  onError,
}: PollingStreamOptions<T>) {
  let timer: number | undefined;
  let stopped = false;

  const tick = async () => {
    if (stopped) {
      return;
    }
    try {
      onData(await run());
    } catch (error) {
      onError?.(error);
    } finally {
      if (!stopped) {
        timer = window.setTimeout(tick, intervalMs);
      }
    }
  };

  void tick();

  return () => {
    stopped = true;
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
  };
}

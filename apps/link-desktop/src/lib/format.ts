export function formatRelativeTime(unix: number | null | undefined) {
  if (!unix) {
    return "never";
  }
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - unix);
  if (delta < 60) {
    return `${delta}s ago`;
  }
  if (delta < 3600) {
    return `${Math.floor(delta / 60)}m ago`;
  }
  if (delta < 86400) {
    return `${Math.floor(delta / 3600)}h ago`;
  }
  return `${Math.floor(delta / 86400)}d ago`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
}

export function titleCase(input: string) {
  return input
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join(" ");
}

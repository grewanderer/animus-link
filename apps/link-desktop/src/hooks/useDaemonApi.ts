import { useMemo } from "react";

import { DaemonApiClient } from "../lib/api";
import { useDesktopStore } from "../state/desktop-store";

export function useDaemonApi() {
  const daemonStatus = useDesktopStore((state) => state.daemonStatus);

  return useMemo(() => {
    const baseUrl =
      daemonStatus?.api_url ||
      import.meta.env.VITE_DAEMON_URL ||
      "http://127.0.0.1:9999";
    return new DaemonApiClient(baseUrl);
  }, [daemonStatus?.api_url]);
}

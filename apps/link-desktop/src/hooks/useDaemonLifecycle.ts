import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  getAppPaths,
  getDaemonStatus,
  getDesktopPreferences,
  onDaemonStatusEvent,
  restartDaemon,
  setDesktopPreferences,
  startDaemon,
  stopDaemon,
  type DesktopPreferences,
} from "../lib/tauri";
import { useDesktopStore } from "../state/desktop-store";

export function useDaemonLifecycle() {
  const setDaemonStatus = useDesktopStore((state) => state.setDaemonStatus);
  const setPaths = useDesktopStore((state) => state.setPaths);
  const setPreferences = useDesktopStore((state) => state.setPreferences);
  const pushToast = useDesktopStore((state) => state.pushToast);
  const daemonStatus = useDesktopStore((state) => state.daemonStatus);
  const startedRef = useRef(false);

  const pathsQuery = useQuery({
    queryKey: ["desktop", "paths"],
    queryFn: async () => {
      const paths = await getAppPaths();
      setPaths(paths);
      return paths;
    },
  });

  const preferencesQuery = useQuery({
    queryKey: ["desktop", "preferences"],
    queryFn: async () => {
      const preferences = await getDesktopPreferences();
      setPreferences(preferences);
      return preferences;
    },
  });

  const daemonQuery = useQuery({
    queryKey: ["desktop", "daemon-status"],
    queryFn: async () => {
      const status = await getDaemonStatus();
      setDaemonStatus(status);
      return status;
    },
    refetchInterval: 4_000,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const status = await startDaemon();
      setDaemonStatus(status);
      return status;
    },
    onError: (error) =>
      pushToast({
        tone: "danger",
        title: "Failed to start daemon",
        body: error instanceof Error ? error.message : "Unknown daemon startup error",
      }),
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      const status = await stopDaemon();
      setDaemonStatus(status);
      return status;
    },
  });

  const restartMutation = useMutation({
    mutationFn: async () => {
      const status = await restartDaemon();
      setDaemonStatus(status);
      return status;
    },
    onSuccess: () =>
      pushToast({
        tone: "info",
        title: "Daemon restarted",
        body: "The desktop shell has reconnected to the local daemon.",
      }),
  });

  const preferencesMutation = useMutation({
    mutationFn: async (preferences: DesktopPreferences) => {
      const next = await setDesktopPreferences(preferences);
      setPreferences(next);
      return next;
    },
  });

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    if (!startedRef.current) {
      startedRef.current = true;
      void startMutation.mutateAsync();
    }

    void onDaemonStatusEvent(({ status }) => {
      setDaemonStatus(status);
      if (status.state === "degraded") {
        pushToast({
          tone: "warning",
          title: "Daemon entered degraded mode",
          body: status.last_error ?? "The sidecar stopped responding to health checks.",
        });
      }
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  return {
    daemonStatus,
    paths: pathsQuery.data,
    preferences: preferencesQuery.data,
    daemonQuery,
    startMutation,
    stopMutation,
    restartMutation,
    preferencesMutation,
  };
}

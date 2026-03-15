import { useQuery } from "@tanstack/react-query";

import { useDaemonApi } from "./useDaemonApi";

export function useDiagnostics() {
  const api = useDaemonApi();
  const diagnosticsQuery = useQuery({
    queryKey: ["daemon", "diagnostics"],
    queryFn: () => api.diagnostics(),
    refetchInterval: 8_000,
  });
  const selfCheckQuery = useQuery({
    queryKey: ["daemon", "self-check"],
    queryFn: () => api.selfCheck(),
    refetchInterval: 8_000,
  });
  const statusQuery = useQuery({
    queryKey: ["daemon", "status"],
    queryFn: () => api.status(),
    refetchInterval: 5_000,
  });

  return {
    diagnosticsQuery,
    selfCheckQuery,
    statusQuery,
  };
}

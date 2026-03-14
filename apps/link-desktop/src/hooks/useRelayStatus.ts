import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { DecisionTargetKind } from "../lib/types";
import { useDaemonApi } from "./useDaemonApi";

export function useRelayStatus(meshId?: string) {
  const api = useDaemonApi();
  const queryClient = useQueryClient();

  const relayStatusQuery = useQuery({
    queryKey: ["daemon", "relay-status"],
    queryFn: () => api.relayStatus(),
    refetchInterval: 6_000,
  });

  const routingStatusQuery = useQuery({
    queryKey: ["daemon", "routing-status"],
    queryFn: () => api.routingStatus(),
    refetchInterval: 4_000,
  });

  const decisionLogQuery = useQuery({
    queryKey: ["daemon", "routing-log"],
    queryFn: () => api.routingDecisionLog(),
    refetchInterval: 6_000,
  });

  const advertiseRelay = useMutation({
    mutationFn: (input: { forced_only: boolean; tags: string[] }) =>
      api.advertiseRelay({ mesh_id: meshId!, forced_only: input.forced_only, tags: input.tags }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["daemon", "relay-status"] }),
        queryClient.invalidateQueries({ queryKey: ["daemon", "routing-status"] }),
      ]);
    },
  });

  const selectRelay = useMutation({
    mutationFn: (input: {
      target_kind: DecisionTargetKind;
      target_id: string;
      relay_node_id: string;
      forced: boolean;
    }) =>
      api.selectRelay({
        mesh_id: meshId!,
        target_kind: input.target_kind,
        target_id: input.target_id,
        relay_node_id: input.relay_node_id,
        forced: input.forced,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["daemon", "relay-status"] }),
        queryClient.invalidateQueries({ queryKey: ["daemon", "routing-status"] }),
        queryClient.invalidateQueries({ queryKey: ["daemon", "routing-log"] }),
      ]);
    },
  });

  const clearRelay = useMutation({
    mutationFn: (input: {
      target_kind: DecisionTargetKind;
      target_id: string;
    }) =>
      api.clearRelaySelection({
        mesh_id: meshId!,
        target_kind: input.target_kind,
        target_id: input.target_id,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["daemon", "relay-status"] }),
        queryClient.invalidateQueries({ queryKey: ["daemon", "routing-status"] }),
        queryClient.invalidateQueries({ queryKey: ["daemon", "routing-log"] }),
      ]);
    },
  });

  return {
    relayStatusQuery,
    routingStatusQuery,
    decisionLogQuery,
    advertiseRelay,
    selectRelay,
    clearRelay,
  };
}

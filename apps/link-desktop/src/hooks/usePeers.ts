import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { NodeRole } from "../lib/types";
import { useDesktopStore } from "../state/desktop-store";
import { useDaemonApi } from "./useDaemonApi";

export function usePeers(meshId?: string) {
  const api = useDaemonApi();
  const queryClient = useQueryClient();
  const pushToast = useDesktopStore((state) => state.pushToast);

  const peersQuery = useQuery({
    queryKey: ["daemon", "peers", meshId],
    queryFn: () => api.peers(meshId!),
    enabled: Boolean(meshId),
    refetchInterval: 5_000,
  });

  const revokePeer = useMutation({
    mutationFn: (peerId: string) => api.revokePeer(meshId!, peerId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["daemon", "peers", meshId] });
      pushToast({
        tone: "warning",
        title: "Peer revoked",
        body: "Service and messenger access for that peer were invalidated.",
      });
    },
  });

  const setNodeRoles = useMutation({
    mutationFn: (input: { nodeId: string; roles: NodeRole[] }) =>
      api.setNodeRoles(input.nodeId, { mesh_id: meshId!, roles: input.roles }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["daemon", "peers", meshId] });
    },
  });

  return {
    peersQuery,
    revokePeer,
    setNodeRoles,
  };
}

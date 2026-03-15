import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useDaemonApi } from "./useDaemonApi";

export function useServices(meshId?: string) {
  const api = useDaemonApi();
  const queryClient = useQueryClient();

  const servicesQuery = useQuery({
    queryKey: ["daemon", "services"],
    queryFn: () => api.services(),
    refetchInterval: 5_000,
  });

  const routingStatusQuery = useQuery({
    queryKey: ["daemon", "routing-status"],
    queryFn: () => api.routingStatus(),
    refetchInterval: 4_000,
  });

  const diagnosticsQuery = useQuery({
    queryKey: ["daemon", "diagnostics"],
    queryFn: () => api.diagnostics(),
    refetchInterval: 8_000,
  });

  const exposeService = useMutation({
    mutationFn: (input: {
      service_name: string;
      local_addr: string;
      allowed_peers: string[];
      tags: string[];
    }) =>
      api.exposeService({
        mesh_id: meshId!,
        service_name: input.service_name,
        local_addr: input.local_addr,
        allowed_peers: input.allowed_peers,
        tags: input.tags,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["daemon", "services"] });
    },
  });

  const connectService = useMutation({
    mutationFn: (input: { service_id?: string; service_name?: string }) =>
      api.connectService({
        mesh_id: meshId!,
        service_id: input.service_id,
        service_name: input.service_name,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["daemon", "routing-status"] });
    },
  });

  const deleteService = useMutation({
    mutationFn: (serviceId: string) => api.deleteService(serviceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["daemon", "services"] });
    },
  });

  return {
    servicesQuery,
    routingStatusQuery,
    diagnosticsQuery,
    exposeService,
    connectService,
    deleteService,
  };
}

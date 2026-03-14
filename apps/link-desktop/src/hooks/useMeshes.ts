import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useDaemonApi } from "./useDaemonApi";
import { useDesktopStore } from "../state/desktop-store";

export function useMeshes() {
  const api = useDaemonApi();
  const queryClient = useQueryClient();
  const selectedMeshId = useDesktopStore((state) => state.selectedMeshId);
  const selectMesh = useDesktopStore((state) => state.selectMesh);
  const pushToast = useDesktopStore((state) => state.pushToast);

  const meshesQuery = useQuery({
    queryKey: ["daemon", "meshes"],
    queryFn: () => api.meshes(),
    refetchInterval: 8_000,
  });

  const createMesh = useMutation({
    mutationFn: (mesh_name?: string) => api.createMesh({ mesh_name }),
    onSuccess: async (result) => {
      selectMesh(result.mesh.mesh_id);
      await queryClient.invalidateQueries({ queryKey: ["daemon", "meshes"] });
      pushToast({
        tone: "success",
        title: "Mesh created",
        body: `Created ${result.mesh.mesh_name}.`,
      });
    },
  });

  const joinMesh = useMutation({
    mutationFn: (input: { invite: string; bootstrap_url: string }) =>
      api.joinMesh(input),
    onSuccess: async (result) => {
      selectMesh(result.mesh.mesh_id);
      await queryClient.invalidateQueries({ queryKey: ["daemon", "meshes"] });
      pushToast({
        tone: "success",
        title: "Joined mesh",
        body: `Connected to ${result.mesh.mesh_name}.`,
      });
    },
  });

  const createInvite = useMutation({
    mutationFn: (meshId: string) => api.createInvite(meshId),
  });

  const activeMesh =
    meshesQuery.data?.meshes.find((mesh) => mesh.config.mesh_id === selectedMeshId) ??
    meshesQuery.data?.meshes[0];

  return {
    meshesQuery,
    activeMesh,
    createMesh,
    joinMesh,
    createInvite,
  };
}

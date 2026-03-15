import { fireEvent, render, screen } from "@testing-library/react";

import { OnboardingPage } from "./OnboardingPage";

const mutateAsync = vi.fn();
const startAsync = vi.fn();

vi.mock("../hooks/useDaemonLifecycle", () => ({
  useDaemonLifecycle: () => ({
    daemonStatus: {
      state: "running",
      healthy: true,
      api_url: "http://127.0.0.1:9999",
      sidecar_mode: "detected_workspace",
    },
    preferences: {
      close_to_tray: true,
      autostart_enabled: false,
      updater_channel: "stable",
      device_label: "Desk",
    },
    preferencesMutation: { mutateAsync: vi.fn() },
    startMutation: { mutateAsync: startAsync },
  }),
}));

vi.mock("../hooks/useMeshes", () => ({
  useMeshes: () => ({
    meshesQuery: {
      data: {
        meshes: [
          {
            config: {
              mesh_id: "mesh-a",
              mesh_name: "Mesh A",
              local_root_identity_id: "peer-a",
              local_device_id: "device-a",
              local_node_id: "node-a",
            },
          },
        ],
      },
    },
    createMesh: { mutateAsync },
    joinMesh: { mutateAsync: vi.fn() },
  }),
}));

vi.mock("../state/desktop-store", () => ({
  useDesktopStore: (selector: (state: { selectedMeshId: string }) => string) =>
    selector({ selectedMeshId: "mesh-a" }),
}));

describe("OnboardingPage", () => {
  it("creates a mesh from the first-run form", () => {
    render(<OnboardingPage />);

    fireEvent.change(screen.getByLabelText("Mesh name"), {
      target: { value: "Operators" },
    });
    fireEvent.click(screen.getByText("Create mesh"));

    expect(mutateAsync).toHaveBeenCalledWith("Operators");
  });
});

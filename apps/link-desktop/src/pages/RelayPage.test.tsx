import { fireEvent, render, screen } from "@testing-library/react";

import { RelayPage } from "./RelayPage";

const selectRelay = vi.fn();

vi.mock("../hooks/useMeshes", () => ({
  useMeshes: () => ({
    activeMesh: {
      config: { mesh_id: "mesh-a" },
    },
  }),
}));

vi.mock("../hooks/usePeers", () => ({
  usePeers: () => ({
    peersQuery: {
      data: {
        peers: [{ peer_id: "peer-c", node_id: "node-c", roles: ["relay"] }],
      },
    },
  }),
}));

vi.mock("../hooks/useRelayStatus", () => ({
  useRelayStatus: () => ({
    relayStatusQuery: { data: { offers: [], selections: [] } },
    routingStatusQuery: { data: { active_connections: [] } },
    decisionLogQuery: { data: { decisions: [] } },
    advertiseRelay: { mutateAsync: vi.fn() },
    selectRelay: { mutateAsync: selectRelay },
    clearRelay: { mutateAsync: vi.fn() },
  }),
}));

describe("RelayPage", () => {
  it("saves preferred relay policy", () => {
    render(<RelayPage />);

    fireEvent.change(screen.getByLabelText("Target id"), {
      target: { value: "service-a" },
    });
    fireEvent.change(screen.getByLabelText("Relay node id"), {
      target: { value: "node-c" },
    });
    fireEvent.click(screen.getByText("Save relay policy"));

    expect(selectRelay).toHaveBeenCalledWith({
      forced: false,
      relay_node_id: "node-c",
      target_id: "service-a",
      target_kind: "service",
    });
  });
});

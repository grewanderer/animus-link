import { fireEvent, render, screen } from "@testing-library/react";

import { ServicesPage } from "./ServicesPage";

const connectService = vi.fn();

vi.mock("../hooks/useMeshes", () => ({
  useMeshes: () => ({
    activeMesh: {
      config: { mesh_id: "mesh-a" },
    },
  }),
}));

vi.mock("../hooks/usePeers", () => ({
  usePeers: () => ({
    peersQuery: { data: { peers: [{ peer_id: "peer-b" }] } },
  }),
}));

vi.mock("../hooks/useServices", () => ({
  useServices: () => ({
    servicesQuery: { data: { services: [], bindings: [] } },
    routingStatusQuery: { data: { active_connections: [] } },
    diagnosticsQuery: { data: { counters: { bytes_proxied_total: 0 } } },
    exposeService: { mutateAsync: vi.fn() },
    connectService: {
      data: {
        local_addr: "127.0.0.1:19000",
        route_path: "peer_relay",
        selected_relay_node_id: "node-c",
      },
      mutateAsync: connectService,
    },
    deleteService: { mutateAsync: vi.fn() },
  }),
}));

describe("ServicesPage", () => {
  it("submits the connect service flow", () => {
    render(<ServicesPage />);

    fireEvent.change(screen.getByLabelText("Service selector"), {
      target: { value: "echo" },
    });
    fireEvent.click(screen.getByText("Connect service"));

    expect(connectService).toHaveBeenCalledWith({ service_name: "echo" });
    expect(screen.getByText("route: peer_relay")).toBeInTheDocument();
  });
});

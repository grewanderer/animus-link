import { render, screen } from "@testing-library/react";

import { MessengerPage } from "./MessengerPage";

vi.mock("../hooks/useMeshes", () => ({
  useMeshes: () => ({
    activeMesh: {
      config: { mesh_id: "mesh-a" },
    },
  }),
}));

vi.mock("../hooks/useMessenger", () => ({
  useMessenger: () => ({
    presenceQuery: {
      data: { peers: [{ peer_id: "peer-b", trust: "deny", online: false, last_seen_unix_secs: 1 }] },
    },
    streamQuery: {
      data: {
        conversations: [
          {
            conversation_id: "conversation-a",
            participants: ["peer-a", "peer-b"],
            title: "DM",
          },
        ],
        messages: [],
      },
    },
    activeConversation: {
      conversation_id: "conversation-a",
      participants: ["peer-a", "peer-b"],
      title: "DM",
    },
    createConversation: { mutateAsync: vi.fn() },
    sendMessage: { mutateAsync: vi.fn() },
    streamError: undefined,
  }),
}));

vi.mock("../state/desktop-store", () => ({
  useDesktopStore: (selector: (state: { selectConversation: (id: string) => void }) => unknown) =>
    selector({ selectConversation: vi.fn() }),
}));

describe("MessengerPage revoked state", () => {
  it("shows the revoked-peer warning and disables compose", () => {
    render(<MessengerPage />);

    expect(screen.getByText("Conversation blocked")).toBeInTheDocument();
    expect(screen.getByText("Send message")).toBeDisabled();
  });
});

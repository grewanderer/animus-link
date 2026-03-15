import { fireEvent, render, screen } from "@testing-library/react";

import { MessengerPage } from "./MessengerPage";

const sendMessage = vi.fn();

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
      data: { peers: [{ peer_id: "peer-b", trust: "allow", online: true, last_seen_unix_secs: 1 }] },
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
    sendMessage: { mutateAsync: sendMessage },
  }),
}));

vi.mock("../state/desktop-store", () => ({
  useDesktopStore: (selector: (state: { selectConversation: (id: string) => void }) => unknown) =>
    selector({ selectConversation: vi.fn() }),
}));

describe("MessengerPage", () => {
  it("sends a message through the active conversation", () => {
    render(<MessengerPage />);

    fireEvent.change(screen.getByPlaceholderText("Write a message"), {
      target: { value: "hello mesh" },
    });
    fireEvent.click(screen.getByText("Send message"));

    expect(sendMessage).toHaveBeenCalledWith({
      body: "hello mesh",
      conversation_id: "conversation-a",
    });
  });
});

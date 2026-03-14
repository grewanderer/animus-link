import { useDesktopStore } from "./desktop-store";

describe("desktop store", () => {
  it("clears local-only state without touching preferences", () => {
    useDesktopStore.getState().selectMesh("mesh-a");
    useDesktopStore.getState().selectConversation("conversation-a");
    useDesktopStore.getState().pushToast({
      tone: "info",
      title: "hello",
    });

    useDesktopStore.getState().clearDesktopState();

    expect(useDesktopStore.getState().selectedMeshId).toBeUndefined();
    expect(useDesktopStore.getState().selectedConversationId).toBeUndefined();
    expect(useDesktopStore.getState().toasts).toHaveLength(0);
  });
});

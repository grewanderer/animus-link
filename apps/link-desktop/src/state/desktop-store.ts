import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  AppPaths,
  DaemonStatus,
  DesktopPreferences,
} from "../lib/tauri";

export interface Toast {
  id: string;
  tone: "info" | "success" | "warning" | "danger";
  title: string;
  body?: string;
}

interface DesktopStoreState {
  daemonStatus?: DaemonStatus;
  paths?: AppPaths;
  preferences?: DesktopPreferences;
  selectedMeshId?: string;
  selectedConversationId?: string;
  toasts: Toast[];
  setDaemonStatus: (status: DaemonStatus) => void;
  setPaths: (paths: AppPaths) => void;
  setPreferences: (preferences: DesktopPreferences) => void;
  selectMesh: (meshId?: string) => void;
  selectConversation: (conversationId?: string) => void;
  pushToast: (toast: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
  clearDesktopState: () => void;
}

export const useDesktopStore = create<DesktopStoreState>()(
  persist(
    (set) => ({
      toasts: [],
      setDaemonStatus: (daemonStatus) => set({ daemonStatus }),
      setPaths: (paths) => set({ paths }),
      setPreferences: (preferences) => set({ preferences }),
      selectMesh: (selectedMeshId) => set({ selectedMeshId }),
      selectConversation: (selectedConversationId) =>
        set({ selectedConversationId }),
      pushToast: (toast) =>
        set((state) => ({
          toasts: [
            ...state.toasts,
            { ...toast, id: `${Date.now()}-${state.toasts.length}` },
          ],
        })),
      dismissToast: (id) =>
        set((state) => ({
          toasts: state.toasts.filter((toast) => toast.id !== id),
        })),
      clearDesktopState: () =>
        set({
          selectedMeshId: undefined,
          selectedConversationId: undefined,
          toasts: [],
        }),
    }),
    {
      name: "animus-link-desktop",
      partialize: (state) => ({
        selectedMeshId: state.selectedMeshId,
        selectedConversationId: state.selectedConversationId,
      }),
    },
  ),
);

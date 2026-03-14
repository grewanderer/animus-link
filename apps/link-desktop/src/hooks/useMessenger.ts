import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createPollingStream } from "../lib/stream";
import { useDesktopStore } from "../state/desktop-store";
import { useDaemonApi } from "./useDaemonApi";

export function useMessenger(meshId?: string) {
  const api = useDaemonApi();
  const queryClient = useQueryClient();
  const selectedConversationId = useDesktopStore(
    (state) => state.selectedConversationId,
  );
  const selectConversation = useDesktopStore((state) => state.selectConversation);
  const [streamError, setStreamError] = useState<string>();

  const conversationsQuery = useQuery({
    queryKey: ["daemon", "messenger", "conversations"],
    queryFn: () => api.conversations(),
    refetchInterval: 10_000,
  });

  const presenceQuery = useQuery({
    queryKey: ["daemon", "messenger", "presence", meshId],
    queryFn: () => api.presence(),
    enabled: Boolean(meshId),
    refetchInterval: 5_000,
  });

  const streamQuery = useQuery({
    queryKey: ["daemon", "messenger", "stream"],
    queryFn: () => api.stream(),
    refetchInterval: 3_000,
  });

  useEffect(() => {
    const stop = createPollingStream({
      intervalMs: 3_000,
      run: () => api.stream(),
      onData: (value) => {
        queryClient.setQueryData(["daemon", "messenger", "stream"], value);
        setStreamError(undefined);
      },
      onError: (error) =>
        setStreamError(error instanceof Error ? error.message : "stream poll failed"),
    });
    return stop;
  }, [api, queryClient]);

  const createConversation = useMutation({
    mutationFn: (input: { participants: string[]; title?: string }) =>
      api.createConversation({
        mesh_id: meshId!,
        participants: input.participants,
        title: input.title,
        tags: [],
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["daemon", "messenger", "conversations"],
      });
    },
  });

  const sendMessage = useMutation({
    mutationFn: (input: { conversation_id: string; body: string }) =>
      api.sendMessage(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["daemon", "messenger", "stream"] });
    },
  });

  const activeConversation =
    streamQuery.data?.conversations.find(
      (conversation) => conversation.conversation_id === selectedConversationId,
    ) ?? streamQuery.data?.conversations[0];

  useEffect(() => {
    if (!selectedConversationId && activeConversation) {
      selectConversation(activeConversation.conversation_id);
    }
  }, [activeConversation?.conversation_id, selectedConversationId, selectConversation]);

  return {
    conversationsQuery,
    presenceQuery,
    streamQuery,
    streamError,
    activeConversation,
    createConversation,
    sendMessage,
  };
}

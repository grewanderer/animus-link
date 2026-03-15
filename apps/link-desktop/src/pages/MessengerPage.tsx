import { useMemo, useState } from "react";

import { EmptyState, Panel } from "../components/Ui";
import { useMeshes } from "../hooks/useMeshes";
import { useMessenger } from "../hooks/useMessenger";
import { formatRelativeTime } from "../lib/format";
import { useDesktopStore } from "../state/desktop-store";

export function MessengerPage() {
  const { activeMesh } = useMeshes();
  const {
    presenceQuery,
    streamQuery,
    activeConversation,
    createConversation,
    sendMessage,
    streamError,
  } = useMessenger(activeMesh?.config.mesh_id);
  const selectConversation = useDesktopStore((state) => state.selectConversation);
  const [participants, setParticipants] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const messages = useMemo(
    () =>
      (streamQuery.data?.messages ?? []).filter(
        (message) => message.conversation_id === activeConversation?.conversation_id,
      ),
    [streamQuery.data?.messages, activeConversation?.conversation_id],
  );
  const revokedParticipants = new Set(
    (presenceQuery.data?.peers ?? [])
      .filter((peer) => peer.trust === "deny")
      .map((peer) => peer.peer_id),
  );
  const conversationRevoked =
    activeConversation?.participants.some((peerId) => revokedParticipants.has(peerId)) ?? false;

  return (
    <div className="page-grid messenger-grid">
      <Panel title="Conversations" description="Mesh-native text messaging over the same daemon substrate as services.">
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createConversation.mutateAsync({
              participants: participants
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
              title,
            });
          }}
        >
          <label>
            <span>Participants</span>
            <input
              placeholder="peer-a, peer-b"
              value={participants}
              onChange={(event) => setParticipants(event.target.value)}
            />
          </label>
          <label>
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <button className="primary-button" type="submit">
            Create conversation
          </button>
        </form>
        <div className="conversation-list">
          {(streamQuery.data?.conversations ?? []).map((conversation) => (
            <button
              key={conversation.conversation_id}
              className={
                activeConversation?.conversation_id === conversation.conversation_id
                  ? "conversation-tile conversation-tile-active"
                  : "conversation-tile"
              }
              onClick={() => selectConversation(conversation.conversation_id)}
            >
              <strong>{conversation.title ?? conversation.conversation_id}</strong>
              <small>{conversation.participants.join(", ")}</small>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Presence" description="Conversation sync state, current online peers, and revoked/offline messaging hints.">
        {presenceQuery.data?.peers.length ? (
          <div className="presence-list">
            {presenceQuery.data.peers.map((peer) => (
              <article key={peer.peer_id} className="event-card">
                <strong>{peer.peer_id}</strong>
                <p>
                  {peer.online ? "online" : "offline"} / trust={peer.trust}
                </p>
                <small>last seen {formatRelativeTime(peer.last_seen_unix_secs)}</small>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No presence data" body="Join peers into the mesh to see live presence." />
        )}
      </Panel>

      <Panel title="Message stream" description="Live polled messenger stream from the daemon.">
        {!activeConversation ? (
          <EmptyState title="No active conversation" body="Create or select a conversation first." />
        ) : (
          <>
            {streamError ? (
              <div className="banner-inline">
                <strong>Sync degraded</strong>
                <span>{streamError}</span>
              </div>
            ) : null}
            {conversationRevoked ? (
              <div className="banner-inline banner-inline-danger">
                <strong>Conversation blocked</strong>
                <span>One or more peers in this conversation are revoked.</span>
              </div>
            ) : null}
            <div className="message-thread">
              {messages.length === 0 ? (
                <EmptyState title="No messages yet" body="Send the first mesh-native message." />
              ) : (
                messages.map((message) => (
                  <article key={message.message_id} className="message-bubble">
                    <header>
                      <strong>{message.sender_peer_id}</strong>
                      <small>{formatRelativeTime(message.sent_at_unix_secs)}</small>
                    </header>
                    <p>{message.body}</p>
                    <footer>
                      {message.decision_id ? "synced" : "accepted by daemon"}
                    </footer>
                  </article>
                ))
              )}
            </div>
            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                if (!activeConversation || conversationRevoked) {
                  return;
                }
                void sendMessage.mutateAsync({
                  conversation_id: activeConversation.conversation_id,
                  body,
                });
                setBody("");
              }}
            >
              <textarea
                placeholder="Write a message"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                disabled={conversationRevoked}
              />
              <button className="primary-button" type="submit" disabled={conversationRevoked}>
                Send message
              </button>
            </form>
          </>
        )}
      </Panel>
    </div>
  );
}

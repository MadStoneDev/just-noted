"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { listChatMessages, markChatRead } from "@/app/actions/chatActions";
import type { ChatMessageView } from "@/lib/chat";

// Live chat for a note: initial load via the server action (RLS + Scribe gate
// resolved there), then a Supabase Realtime subscription (RLS-scoped to
// participants) that refetches on any insert/edit/delete. Refetch-on-change
// keeps P1 simple and correct; it can become incremental later.
export function useNoteChat(noteId: string | null) {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [canSend, setCanSend] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const noteRef = useRef(noteId);
  noteRef.current = noteId;

  const reload = useCallback(async () => {
    const id = noteRef.current;
    if (!id) return;
    const res = await listChatMessages(id);
    if (noteRef.current !== id) return; // note changed mid-flight
    if (res.success) {
      setMessages(res.messages);
      setCanSend(res.canSend);
    }
  }, []);

  useEffect(() => {
    if (!noteId) {
      setMessages([]);
      setCanSend(false);
      setReady(false);
      return;
    }
    setLoading(true);
    setReady(false);
    reload().finally(() => {
      setLoading(false);
      setReady(true);
    });
  }, [noteId, reload]);

  useEffect(() => {
    if (!noteId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`note_chat:${noteId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "note_chat_messages", filter: `note_id=eq.${noteId}` },
        () => { reload(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [noteId, reload]);

  // Mark read once messages are loaded and whenever new ones arrive.
  useEffect(() => {
    if (!noteId || !ready) return;
    markChatRead(noteId).catch(() => {});
  }, [noteId, ready, messages.length]);

  return { messages, canSend, loading, ready, reload };
}

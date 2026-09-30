"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { getChatUnread } from "@/app/actions/chatActions";

// Unread chat count for the Chat button badge. Enabled only while the panel is
// CLOSED (when it's open the panel marks messages read); it refetches on any
// realtime change to the note's messages.
export function useChatUnread(noteId: string | null, enabled: boolean) {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!noteId || !enabled) { setUnread(0); return; }
    try {
      setUnread(await getChatUnread(noteId));
    } catch {
      /* leave the last value */
    }
  }, [noteId, enabled]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!noteId || !enabled) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`note_chat_unread:${noteId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "note_chat_messages", filter: `note_id=eq.${noteId}` },
        () => { refresh(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [noteId, enabled, refresh]);

  return { unread, refresh };
}

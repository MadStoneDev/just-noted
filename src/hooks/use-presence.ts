"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export interface PresenceUser {
  userId: string;
  handle: string;
  avatarUrl?: string | null;
  color: string;
  lastActive: number;
  self?: boolean;
}

// Collaborator colours (pass on white; see 01-foundations). Assigned
// deterministically per user id so a person keeps their colour across sessions.
const PALETTE = ["#0FB8B0", "#E0723C", "#7C6FF0", "#D6478A", "#3DA35D", "#C9A227", "#3B82C4", "#B3311F"];
export function colorForUser(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
const colorFor = colorForUser;

// Feature flag for the private-channel rollout. Off by default so deploying the
// client is safe before the realtime.messages RLS migration is applied.
const PRIVATE_REALTIME = process.env.NEXT_PUBLIC_PRIVATE_REALTIME === "1";

/**
 * Live presence for a note (design surface 05). Everyone with the note open on
 * the same key joins a Supabase Realtime presence channel. Each client
 * broadcasts a heartbeat with its last-active time so others can show "editing
 * now" vs "idle Nm"; Supabase drops a member when its socket closes.
 */
export function usePresence(key: string | null): PresenceUser[] {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const lastActive = useRef(Date.now());

  // Track local activity so we can broadcast an accurate idle time.
  useEffect(() => {
    const bump = () => { lastActive.current = Date.now(); };
    window.addEventListener("keydown", bump);
    window.addEventListener("pointerdown", bump);
    return () => {
      window.removeEventListener("keydown", bump);
      window.removeEventListener("pointerdown", bump);
    };
  }, []);

  useEffect(() => {
    if (!key) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: a } = await supabase
        .from("authors")
        .select("username, avatar_url")
        .eq("id", user.id)
        .single();
      const handle = (a as any)?.username || "someone";
      const avatarUrl = (a as any)?.avatar_url || null;

      // Private Realtime rollout (step 1): gated behind NEXT_PUBLIC_PRIVATE_REALTIME
      // so this deploy is inert until the realtime.messages RLS migration is
      // applied and the flag is turned on. When private, the socket must carry
      // the user's JWT so the RLS policy can read auth.uid().
      if (PRIVATE_REALTIME) {
        const { data: { session } } = await supabase.auth.getSession();
        await supabase.realtime.setAuth(session?.access_token ?? null);
      }
      channel = supabase.channel(`presence:${key}`, {
        config: { presence: { key: user.id }, private: PRIVATE_REALTIME },
      });

      const sync = () => {
        if (!channel) return;
        const state = channel.presenceState() as Record<string, any[]>;
        const list: PresenceUser[] = [];
        for (const id in state) {
          const meta = state[id][0] || {};
          list.push({
            userId: id,
            handle: meta.handle || "someone",
            avatarUrl: meta.avatarUrl || null,
            color: colorFor(id),
            lastActive: meta.lastActive || Date.now(),
            self: id === user.id,
          });
        }
        setUsers(list);
      };

      channel
        .on("presence", { event: "sync" }, sync)
        .on("presence", { event: "join" }, sync)
        .on("presence", { event: "leave" }, sync)
        .subscribe((status: string) => {
          if (status === "SUBSCRIBED" && channel) {
            channel.track({ handle, avatarUrl, lastActive: Date.now() });
          }
        });

      heartbeat = setInterval(() => {
        channel?.track({ handle, avatarUrl, lastActive: lastActive.current });
      }, 15000);
    })();

    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      if (channel) supabase.removeChannel(channel);
    };
  }, [key]);

  return users;
}

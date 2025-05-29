"use client";

import { useCallback, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

import { Tables } from "../../../database.types";
import { JustNote, NoteSource } from "@/types/just-notes";

import { getUserId } from "@/utils/general/notes";
import { getNotesByUserId } from "@/app/actions/useRedisActions";

type SupabaseNote = Tables<`notes`>;
type RedisNote = {
  id: string;
  created_at?: number;
  updated_at?: number;
  author?: string;
  title: string;
  content: string;
  is_private: boolean | null;
  is_pinned: boolean | null;
  is_collapsed: boolean | null;
  order?: number | null;
  goal?: number | null;
  goal_type?: string | null;
};

export function useJustNote() {
  // States
  const [isLoading, setIsLoading] = useState(true);

  const [notes, setNotes] = useState<JustNote[]>([]);
  const [newNoteId, setNewNoteId] = useState<string | null>(null);

  // User States
  const [redisUserId, setRedisUserId] = useState<string | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Supabase
  const supabase = createClient();

  // Functions
  const convertRedisToJustNote = useCallback((note: RedisNote): JustNote => {
    return {
      id: note.id,
      created_at: note.created_at || Date.now(),
      updated_at: note.updated_at || Date.now(),
      author: note.author || "",
      title: note.title || "",
      content: note.content || "",
      is_private: note.is_private || false,
      is_pinned: note.is_pinned || false,
      is_collapsed: note.is_collapsed || false,
      order: note.order || 0,
      goal: note.goal || 0,
      goal_type: note.goal_type || "",
      source: "redis",
    };
  }, []);

  const convertSupabaseToJustNote = useCallback(
    (note: SupabaseNote): JustNote => {
      return {
        id: note.id,
        created_at: note.created_at
          ? new Date(note.created_at).getTime()
          : Date.now(),
        updated_at: note.updated_at
          ? new Date(note.updated_at).getTime()
          : Date.now(),
        author: note.author || "",
        title: note.title || "",
        content: note.content || "",
        is_private: note.is_private || false,
        is_pinned: note.is_pinned || false,
        is_collapsed: note.is_collapsed || false,
        order: note.order || 0,
        goal: note.goal || 0,
        goal_type: note.goal_type || "",
        source: "supabase",
      };
    },
    [],
  );

  const convertToJustNote = useCallback(
    (note: any, source: NoteSource): JustNote => {
      if (source === "redis") {
        return convertRedisToJustNote(note);
      } else {
        return convertSupabaseToJustNote(note);
      }
    },
    [],
  );

  const convertJustNoteToRedis = useCallback((note: JustNote): RedisNote => {
    return {
      id: note.id,
      created_at: note.created_at,
      updated_at: note.updated_at,
      author: note.author,
      title: note.title,
      content: note.content,
      is_private: note.is_private,
      is_pinned: note.is_pinned,
      is_collapsed: note.is_collapsed,
      order: note.order,
      goal: note.goal,
      goal_type: note.goal_type,
    };
  }, []);

  const convertJustNoteToSupabase = useCallback(
    (note: JustNote): SupabaseNote => {
      return {
        id: note.id,
        created_at: new Date(
          typeof note.created_at === "number" ? note.created_at : Date.now(),
        ).toISOString(),
        updated_at: new Date(
          typeof note.updated_at === "number" ? note.updated_at : Date.now(),
        ).toISOString(),
        author: note.author ?? "",
        title: note.title ?? "",
        content: note.content ?? "",
        is_private: note.is_private,
        is_pinned: note.is_pinned,
        is_collapsed: note.is_collapsed,
        order: note.order ?? null,
        goal: note.goal ?? null,
        goal_type: note.goal_type ?? "",
      };
    },
    [],
  );

  const convertFromJustNote = useCallback(
    (note: JustNote, target: NoteSource): any => {
      if (target === "redis") {
        return convertJustNoteToRedis(note);
      } else {
        return convertJustNoteToSupabase(note);
      }
    },
    [],
  );

  // Effects
  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const authUser = data.user;

        const localUserId = getUserId();
        const authUserId = authUser?.id;

        setRedisUserId(localUserId);
        setSupabaseUser(authUser);

        const authenticated = !!authUser;
        setIsAuthenticated(authenticated);

        // Load Notes from Both Sources
        let initialNotes: JustNote[] = [];

        // Get Redis Notes
        const rawRedisNotes = await getNotesByUserId(localUserId);
        const redisNotes = rawRedisNotes.notes.map((note: any) => {
          return convertToJustNote(note, "redis");
        });

        initialNotes = [...initialNotes, ...redisNotes];

        console.log("--- Fetched Redis Notes ---");
        console.log("Redis notes:", initialNotes);
      } catch (error) {
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotes();
  }, []);

  return {
    notes,
    isLoading,
    newNoteId,
    redisUserId,
    supabaseUser,
    supabase,
  };
}

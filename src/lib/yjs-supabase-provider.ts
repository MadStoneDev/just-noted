"use client";

import * as Y from "yjs";
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { createClient } from "@/utils/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

/**
 * Syncs a Yjs document + awareness over a Supabase Realtime broadcast channel
 * (design surface 05 — collaborative editing). No websocket server needed: doc
 * updates and awareness are exchanged as broadcast messages, and a sync-request
 * on join pulls the current state from peers. CRDT merge means edits never
 * conflict; persistence back to Postgres is handled by the editor.
 */
export class SupabaseYjsProvider {
  private doc: Y.Doc;
  private awareness: Awareness;
  private channel: RealtimeChannel;
  private supabase = createClient();
  private docHandler: (update: Uint8Array, origin: unknown) => void;
  private awarenessHandler: (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => void;
  private beforeUnload: () => void;
  private onRevive: () => void;

  constructor(roomKey: string, doc: Y.Doc, awareness: Awareness) {
    this.doc = doc;
    this.awareness = awareness;
    this.channel = this.supabase.channel(`yjs:${roomKey}`, {
      config: { broadcast: { self: false } },
    });

    // Local doc changes → broadcast. Skip updates we applied from a peer
    // (origin === this) to avoid an echo loop.
    this.docHandler = (update, origin) => {
      if (origin === this) return;
      this.channel.send({ type: "broadcast", event: "yjs-update", payload: { u: toB64(update) } });
    };
    doc.on("update", this.docHandler);

    this.awarenessHandler = ({ added, updated, removed }, origin) => {
      if (origin === this) return;
      const changed = [...added, ...updated, ...removed];
      const u = encodeAwarenessUpdate(awareness, changed);
      this.channel.send({ type: "broadcast", event: "awareness", payload: { u: toB64(u) } });
    };
    awareness.on("update", this.awarenessHandler);

    this.channel
      .on("broadcast", { event: "yjs-update" }, ({ payload }) => {
        Y.applyUpdate(doc, fromB64(payload.u), this);
      })
      .on("broadcast", { event: "awareness" }, ({ payload }) => {
        applyAwarenessUpdate(awareness, fromB64(payload.u), this);
      })
      .on("broadcast", { event: "sync-request" }, () => {
        // A peer (re)joined — send them our full doc + awareness state.
        this.pushState();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") this.syncState();
      });

    // Broadcast (broadcast!) has no replay: a backgrounded/throttled tab misses
    // updates while it's asleep. On revival, re-exchange full state so the CRDT
    // merges both sides — otherwise a stale tab can save over newer content.
    this.onRevive = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      this.syncState();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onRevive);
    if (typeof window !== "undefined") {
      window.addEventListener("focus", this.onRevive);
      window.addEventListener("online", this.onRevive);
    }

    // Best-effort: tell peers we're gone so our caret disappears promptly.
    this.beforeUnload = () => {
      removeAwarenessStates(this.awareness, [this.doc.clientID], "unload");
    };
    if (typeof window !== "undefined") window.addEventListener("beforeunload", this.beforeUnload);
  }

  /** Broadcast our full doc + awareness state so peers can merge it. */
  private pushState() {
    this.channel.send({
      type: "broadcast",
      event: "yjs-update",
      payload: { u: toB64(Y.encodeStateAsUpdate(this.doc)) },
    });
    const ids = Array.from(this.awareness.getStates().keys());
    if (ids.length) {
      this.channel.send({
        type: "broadcast",
        event: "awareness",
        payload: { u: toB64(encodeAwarenessUpdate(this.awareness, ids)) },
      });
    }
  }

  /**
   * Bidirectional resync: push our state (so peers merge our offline edits) and
   * request theirs (so we merge what we missed). CRDT-safe and idempotent.
   */
  private syncState() {
    this.pushState();
    this.channel.send({ type: "broadcast", event: "sync-request", payload: {} });
  }

  destroy() {
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onRevive);
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", this.onRevive);
      window.removeEventListener("online", this.onRevive);
      window.removeEventListener("beforeunload", this.beforeUnload);
    }
    this.doc.off("update", this.docHandler);
    this.awareness.off("update", this.awarenessHandler);
    removeAwarenessStates(this.awareness, [this.doc.clientID], "destroy");
    this.supabase.removeChannel(this.channel);
  }
}

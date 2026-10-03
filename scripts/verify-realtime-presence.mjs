// Verify private-channel authorization for presence against our self-hosted
// Realtime (step 1 of the rollout). Proves a participant can join
// presence:<noteId> while a non-participant is denied.
//
// Prereqs: apply supabase/migrations/20261003_realtime_presence_authz.sql first.
// Creds come ONLY from env vars (never paste them). Needs @supabase/supabase-js
// (already a dependency).
//
// Required env:
//   SUPABASE_URL              your self-hosted Supabase URL
//   SUPABASE_ANON_KEY         anon public key
//   RT_PARTICIPANT_EMAIL      a user who CAN access RT_NOTE_ID (owner or reader)
//   RT_PARTICIPANT_PASSWORD
//   RT_OUTSIDER_EMAIL         a user who CANNOT access RT_NOTE_ID
//   RT_OUTSIDER_PASSWORD
//   RT_NOTE_ID                a note id the participant can access
// Optional:
//   RT_TRASHED_NOTE_ID        a note the participant owns but has trashed
//
// Run:  node scripts/verify-realtime-presence.mjs

import { createClient } from "@supabase/supabase-js";

const need = (k) => {
  const v = process.env[k];
  if (!v) { console.error(`Missing env ${k}`); process.exit(2); }
  return v;
};

const URL = need("SUPABASE_URL");
const ANON = need("SUPABASE_ANON_KEY");
const NOTE_ID = need("RT_NOTE_ID");
const TRASHED_NOTE_ID = process.env.RT_TRASHED_NOTE_ID || null;

// Try to join presence:<noteId> as a signed-in user. Resolves to the terminal
// subscribe status: "SUBSCRIBED" (allowed) or "CHANNEL_ERROR"/"TIMED_OUT" (denied).
async function tryJoin(email, password, noteId) {
  const supabase = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  await supabase.realtime.setAuth(data.session.access_token);

  const channel = supabase.channel(`presence:${noteId}`, {
    config: { presence: { key: data.user.id }, private: true },
  });

  const status = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve("TIMED_OUT"), 8000);
    channel.subscribe((s, err) => {
      if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "CLOSED" || s === "TIMED_OUT") {
        clearTimeout(timer);
        if (err) console.log(`   (channel error: ${err.message || err})`);
        resolve(s);
      }
    });
  });

  try { await supabase.removeChannel(channel); } catch {}
  await supabase.auth.signOut().catch(() => {});
  return status;
}

const expect = (label, actual, wanted) => {
  const ok = actual === wanted;
  console.log(`${ok ? "✓" : "✗"} ${label}: got ${actual}, expected ${wanted}`);
  return ok;
};

(async () => {
  let allOk = true;
  console.log("Private presence authorization check (Realtime v2.76.5)\n");

  const pEmail = need("RT_PARTICIPANT_EMAIL"), pPass = need("RT_PARTICIPANT_PASSWORD");
  const oEmail = need("RT_OUTSIDER_EMAIL"), oPass = need("RT_OUTSIDER_PASSWORD");

  allOk &= expect("participant can join their note", await tryJoin(pEmail, pPass, NOTE_ID), "SUBSCRIBED");
  allOk &= expect("non-participant is denied", await tryJoin(oEmail, oPass, NOTE_ID), "CHANNEL_ERROR");

  if (TRASHED_NOTE_ID) {
    allOk &= expect("trashed note blocks the owner too", await tryJoin(pEmail, pPass, TRASHED_NOTE_ID), "CHANNEL_ERROR");
  } else {
    console.log("· (set RT_TRASHED_NOTE_ID to also check the trashed-note case)");
  }

  console.log(`\n${allOk ? "PASS — private presence authorization works." : "FAIL — see above."}`);
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error("Error:", e.message); process.exit(2); });

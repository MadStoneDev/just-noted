import React from "react";

import { createClient } from "@/utils/supabase/server";
import GlobalHeader from "@/components/global-header";
import NoteWrapper from "@/components/note-wrapper";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <GlobalHeader user={user} hideOnMobile />
      <NoteWrapper />
    </>
  );
}

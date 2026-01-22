import React from "react";
import FaqBlock from "@/components/faq-block";

import { createClient } from "@/utils/supabase/server";
import GlobalHeader from "@/components/global-header";
import GlobalFooter from "@/components/global-footer";
import NoteWrapper from "@/components/note-wrapper";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <GlobalHeader user={user} />

      <div className={`relative flex-grow w-full`}>
        <NoteWrapper />

        <h1
          className={`px-3 md:px-0 mt-6 mx-auto max-w-60 md:max-w-full font-secondary text-xl font-semibold text-center`}
        >
          The Distraction-Free Note Taking Platform
        </h1>
        <FaqBlock />
      </div>

      <GlobalFooter />
    </>
  );
}

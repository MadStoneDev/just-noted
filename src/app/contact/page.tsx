import ContactForm from "@/components/contact-form";
import { createClient } from "@/utils/supabase/server";
import GlobalHeader from "@/components/global-header";
import React from "react";
import GlobalFooter from "@/components/global-footer";

export const metadata = {
  title: "Get in touch - Just Noted",
  description:
    "If you have any ideas, questions, or feedback on how to make Just Noted even better please get in touch. We'd" +
    " love to hear from you.",
};

export default async function ContactPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <GlobalHeader user={user} />
      <main className={`mt-2 flex-grow w-full overflow-hidden`}>
        <div className={`pt-3 sm:text-center`}>
          <h1 className={`text-xl font-semibold`}>Get in touch</h1>
          <h2 className={`font-light`}>Have any ideas? Questions? Feedback?</h2>
          <ContactForm />
        </div>
      </main>
      <GlobalFooter />
    </>
  );
}

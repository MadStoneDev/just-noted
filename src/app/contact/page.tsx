import ContactForm from "@/components/contact-form";
import { createClient } from "@/utils/supabase/server";
import GlobalHeader from "@/components/global-header";
import React from "react";
import GlobalFooter from "@/components/global-footer";

export const metadata = {
  title: "Get in touch - JustNoted",
  description:
    "If you have any ideas, questions, or feedback on how to make JustNoted even better please get in touch.",
};

export default async function ContactPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <GlobalHeader user={user} />
      <main className="flex-grow w-full">
        <div className="max-w-lg mx-auto px-6 py-10 text-center">
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Get in touch</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Have any ideas? Questions? Feedback?</p>
          <ContactForm />
        </div>
      </main>
      <GlobalFooter />
    </>
  );
}

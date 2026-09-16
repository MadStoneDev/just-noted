import { Metadata } from "next";
import { redirect } from "next/navigation";

import ProfileBlock from "@/components/profile-block";
import GlobalHeader from "@/components/global-header";
import GlobalFooter from "@/components/global-footer";

import { createClient } from "@/utils/supabase/server";
import { countWordsInContent } from "@/utils/word-count";

// Generate metadata
export const metadata: Metadata = {
  title: "My Profile - JustNoted",
  description: "Your profile on JustNoted - Distraction-Free Note Taking",
  openGraph: {
    title: "My Profile - JustNoted",
    description: "Your profile on JustNoted - Distraction-Free Note Taking",
    images: [
      {
        url: "/JustNoted_OG.jpg",
        width: 1200,
        height: 630,
        alt: "My Profile - JustNoted",
      },
    ],
    locale: "en_US",
    type: "profile",
    siteName: "JustNoted",
  },
  twitter: {
    card: "summary_large_image",
    title: "My Profile - JustNoted",
    description: "Your profile on JustNoted - Distraction-Free Note Taking",
    images: ["/JustNoted_OG.jpg"],
    creator: "@justnoted",
  },
  robots: {
    index: false, // Don't index user profiles for privacy
    follow: true,
  },
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/get-access");
  }

  const { data: authorData, error: authorError } = await supabase
    .from("authors")
    .select("*")
    .eq("id", user.id)
    .single();

  // Lifetime writing stats — total words currently across all of the user's
  // notes, and the note count. A foundation for future achievements.
  const { data: notesData } = await supabase
    .from("notes")
    .select("content")
    .eq("author", user.id);

  const noteCount = notesData?.length ?? 0;
  const totalWords = (notesData ?? []).reduce(
    (sum, n) => sum + countWordsInContent(n?.content || ""),
    0,
  );

  const stats = {
    totalWords,
    noteCount,
    memberSince: user.created_at ?? null,
  };

  return (
    <>
      <GlobalHeader user={user} />
      <main className="flex-grow w-full pt-14">
        <div className="max-w-2xl mx-auto px-6 py-10">
          <ProfileBlock user={user} authorData={authorData} stats={stats} />
        </div>
      </main>
      <GlobalFooter />
    </>
  );
}

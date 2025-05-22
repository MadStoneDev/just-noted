import { Metadata } from "next";
import { redirect } from "next/navigation";

import ProfileBlock from "@/components/profile-block";
import GlobalHeader from "@/components/global-header";
import GlobalFooter from "@/components/global-footer";

import { createClient } from "@/utils/supabase/server";

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

  return (
    <>
      <GlobalHeader user={user} />
      <ProfileBlock user={user} authorData={authorData} />
      <GlobalFooter />
    </>
  );
}

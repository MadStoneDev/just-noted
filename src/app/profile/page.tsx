import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import ProfileBlock from "@/components/profile-block";
import GlobalHeader from "@/components/global-header";
import GlobalFooter from "@/components/global-footer";

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

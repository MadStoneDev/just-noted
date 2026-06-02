import BackupManager from "@/components/backup-manager";
import GlobalHeader from "@/components/global-header";
import GlobalFooter from "@/components/global-footer";
import { createClient } from "@/utils/supabase/server";

export const metadata = {
  title: "Backup Manager - JustNoted",
};

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <>
      <GlobalHeader user={user} />
      <main className="flex-grow w-full pt-14">
        <div className="max-w-2xl mx-auto px-6 py-10">
          <BackupManager />
        </div>
      </main>
      <GlobalFooter />
    </>
  );
}

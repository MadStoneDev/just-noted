import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import GlobalHeader from "@/components/global-header";
import GlobalFooter from "@/components/global-footer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SharedNotePageWrapper({
  params,
}: {
  params: Promise<{ shortcode: string }>;
}) {
  const { shortcode } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Dynamic import to avoid server component issues
  const SharedNotePage = (await import("@/components/shared-note-page"))
    .default;

  return (
    <>
      <GlobalHeader user={user} />
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-neutral-500 animate-pulse">
              Loading shared note...
            </div>
          </div>
        }
      >
        <SharedNotePage />
      </Suspense>
      <GlobalFooter />
    </>
  );
}

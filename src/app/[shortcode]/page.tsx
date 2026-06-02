import { redirect } from "next/navigation";

export default async function LegacySharedNote({
  params,
}: {
  params: Promise<{ shortcode: string }>;
}) {
  const { shortcode } = await params;

  // Known routes that shouldn't redirect
  const knownRoutes = ["favicon.ico", "robots.txt", "sitemap.xml", "JustNoted_OG.jpg"];
  if (knownRoutes.includes(shortcode)) {
    return null;
  }

  redirect(`/n/${shortcode}`);
}

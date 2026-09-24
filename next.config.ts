import type { NextConfig } from "next";

// A unique id per build, used by the "update available" banner: the client
// bundle bakes this in, and /api/version reports the running deploy's value, so
// a mismatch means a newer deploy is live. Prefer the git SHA when the platform
// provides it (Coolify sets SOURCE_COMMIT); otherwise the build timestamp.
const buildId = process.env.SOURCE_COMMIT || `${Date.now()}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  generateBuildId: async () => buildId,
  // This is important for MDXEditor to work properly
  transpilePackages: ["@mdxeditor/editor"],
  // If you have webpack configuration, merge with this:
  turbopack: {},
  typescript: {
    // Enforce type-checking on build. This previously hid a runtime crash
    // (a missing import) plus several type errors — keep it on.
    ignoreBuildErrors: false,
  },
  eslint: {
    // No ESLint config is set up in this project yet, so linting during build
    // would fail/hang. Left disabled until a config is added (follow-up), at
    // which point flip this to false.
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Avatar/cover uploads post the image through a server action. Images are
    // downscaled/compressed client-side first (see utils/image/compress), so
    // this is just a safety net for GIFs / compression fallbacks.
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;

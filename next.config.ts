import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
    // Avatar/cover uploads post the image through a server action; the default
    // 1MB body limit is too small for images (avatars up to 4MB, covers 2MB).
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // This is important for MDXEditor to work properly
  transpilePackages: ["@mdxeditor/editor"],
  // If you have webpack configuration, merge with this:
  turbopack: {},
};

export default nextConfig;

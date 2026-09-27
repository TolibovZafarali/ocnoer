import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  transpilePackages: ["@ocnoer/story-core"],
  experimental: {
    serverActions: {
      bodySizeLimit: "32mb"
    }
  }
};

export default nextConfig;

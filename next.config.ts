import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ocnoer/story-core"],
  experimental: {
    serverActions: {
      bodySizeLimit: "32mb"
    }
  }
};

export default nextConfig;

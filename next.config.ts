import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  skipTrailingSlashRedirect: true,
  skipMiddlewareUrlNormalize: true,
  transpilePackages: ["@ocnoer/story-core"],
  experimental: {
    serverActions: {
      bodySizeLimit: "32mb"
    }
  }
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: 209715200, // 200MB in bytes
    },
  },
};

export default nextConfig;

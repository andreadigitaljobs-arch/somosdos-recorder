import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: 209715200, // 200MB in bytes
    },
  },
};

export default nextConfig;

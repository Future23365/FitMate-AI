import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    imageSizes: [32, 48, 64, 96, 128, 256, 384],
    unoptimized: false,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
      },
    ],
  },
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;

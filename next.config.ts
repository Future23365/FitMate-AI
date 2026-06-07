import type { NextConfig } from "next";

// 全站声明站点不应被搜索引擎索引，和 robots.txt 一起随部署生效。
const robotsExclusionHeader = "noindex, nofollow, noarchive, nosnippet";

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: robotsExclusionHeader,
          },
        ],
      },
    ];
  },
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

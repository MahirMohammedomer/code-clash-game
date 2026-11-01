import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Long-lived browser caching for static game content: on slow networks,
  // repeat visits should never re-download the arcade (the service worker
  // also caches these, versioned). Page HTML itself stays fresh.
  async headers() {
    const longCache = [
      {
        key: "Cache-Control",
        value: "public, max-age=604800, stale-while-revalidate=86400",
      },
    ];
    return [
      { source: "/arcade/:path*", headers: longCache },
      { source: "/games/:path*", headers: longCache },
      { source: "/icon-:size.png", headers: longCache },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Resume uploads go through a Server Action. The 1MB default rejects a
      // perfectly ordinary two-page PDF with embedded fonts. We cap uploads at
      // 5MB in lib/resume/upload.ts and leave headroom here for multipart
      // boundary and field overhead, so the app's own error message is what a
      // user sees rather than a framework-level 413.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pi runs only in the separate Stage 2 worker, but keeping it external avoids
  // bundling its dynamic Node integrations if server modules are traced by Next.js.
  serverExternalPackages: ["@earendil-works/pi-coding-agent"],
};

export default nextConfig;

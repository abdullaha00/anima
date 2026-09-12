import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pi uses dynamic Node integrations, so it must remain a native server dependency rather
  // than being bundled for a browser or edge runtime.
  serverExternalPackages: ["@earendil-works/pi-coding-agent"],
  // The live route reads these at runtime; explicitly trace them into the Vercel function.
  outputFileTracingIncludes: {
    "/api/reassess": ["./config/stage1/mortality.json", "./prompts/stage1/mortality-v1.md"],
  },
};

export default nextConfig;

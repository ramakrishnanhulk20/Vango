import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:8787";

const nextConfig: NextConfig = {
  // Verification builds write to a second folder so they never touch the .next
  // folder the dev server is holding open.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  // Next writes its own AGENTS.md and CLAUDE.md on every dev start. This repo
  // keeps those names for its own private files, so the generator stays off.
  agentRules: false,

  // The mini app calls the API on its own origin. Inside the Nimiq Pay WebView a
  // cross-origin call would need CORS and a second hostname to trust, so the app
  // and the API always look like one site from the phone's side.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // emits .next/standalone with a minimal server.js — the documented way to
  // containerize a Next.js app (docs: guides/self-hosting, config/output)
  output: "standalone",
  // keep the native pg driver out of the server bundle
  serverExternalPackages: ["pg"],
};

export default nextConfig;

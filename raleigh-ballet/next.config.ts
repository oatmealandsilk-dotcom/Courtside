import type { NextConfig } from "next";
import { legacyRedirects } from "./src/lib/redirects";

const config: NextConfig = {
  serverExternalPackages: ["postgres", "@electric-sql/pglite"],
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  async redirects() {
    return legacyRedirects.map(([source, destination]) => ({ source, destination, permanent: true }));
  },
};
export default config;

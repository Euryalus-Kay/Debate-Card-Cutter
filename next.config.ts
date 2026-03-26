import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["cheerio", "mammoth", "pdf-parse"],
};

export default nextConfig;

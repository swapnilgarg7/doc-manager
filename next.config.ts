import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist ships its own worker/font assets; keep it out of the bundler so
  // it runs correctly in the Node.js server runtime used by the API route.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;

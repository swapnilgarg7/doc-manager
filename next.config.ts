import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs now runs in the browser (files are read client-side via the File
  // System Access API and never uploaded); nothing PDF-related runs server-side
  // anymore, so no server-external packages are needed.
};

export default nextConfig;

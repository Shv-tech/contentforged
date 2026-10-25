/** @type {import('next').NextConfig} */

const nextConfig = {
  swcMinify: true,

  experimental: {
    // Slide rendering reads its fonts from disk at request time; make sure
    // the serverless bundle for that route carries them.
    outputFileTracingIncludes: {
      '/api/drafts/[id]/visual': ['./public/fonts/visuals/**/*'],
    },
  },

  images: {
    // Art plates and avatars are served as-is; they are already sized for the web.
    unoptimized: true,
  },

  webpack: (config, { isServer }) => {
    // pdf-parse and mermaid reference the optional native `canvas` package,
    // which is never used here and does not install on serverless hosts.
    config.resolve.alias.canvas = false;

    // jsPDF is browser-only; keep it out of server bundles entirely.
    if (isServer) config.externals.push('jspdf');

    return config;
  },
};

module.exports = nextConfig;

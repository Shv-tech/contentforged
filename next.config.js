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

  // Baseline security headers on every response. There is no Content-Security-
  // Policy yet: the marketing site loads Razorpay, AdSense and analytics
  // scripts, and a CSP needs those sources listed and tested before it ships.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          // Voice capture needs the microphone; nothing needs location.
          { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=()' },
        ],
      },
    ];
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. MUST BE TRUE: Enables the Rust-based SWC compiler
  swcMinify: true,
  
  webpack: (config, { isServer, dev }) => {
    // 2. THE BUILD FIX: Tells Webpack to ignore the optional 'canvas' dependency
    config.resolve.alias.canvas = false;
    
    // 3. THE jsPDF FIX: Prevent 'jsPDF' from crashing the server environment
    if (isServer) {
      config.externals.push('jspdf');
    }

    // 4. THE UNICODE FIX: Force ASCII-only output in minification
    if (!dev) {
      const TerserPlugin = require('terser-webpack-plugin');
      config.optimization.minimizer = [
        new TerserPlugin({
          terserOptions: {
            format: {
              ascii_only: true, // This prevents unicode errors during build
            },
          },
        }),
      ];
    }

    return config;
  },
};

module.exports = nextConfig;
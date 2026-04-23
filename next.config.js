/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. Disables the strict SWC compiler minification
  swcMinify: false,
  
  // 2. Forcefully overrides Webpack's Terser plugin which is crashing on jsPDF
  webpack: (config) => {
    config.optimization.minimize = false;
    return config;
  },
};

export default nextConfig; 
// Note: If your file is named .js instead of .mjs, use: module.exports = nextConfig;
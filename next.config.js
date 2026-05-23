/** @type {import('next').NextConfig} */
const nextConfig = {
  swcMinify: true,
  
  webpack: (config, { isServer }) => {
    config.resolve.alias.canvas = false;
    
    if (isServer) {
      config.externals.push('jspdf', 'pdfjs-dist');
    }

    // THIS IS THE FIX: Explicitly set the minimizer to an empty array
    // to bypass the Terser/Webpack collision during the production build.
    config.optimization.minimize = true;
    config.optimization.minimizer = []; 

    return config;
  },
};

module.exports = nextConfig;
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  // Configure environment variables
  env: {
    // Backend URL will be specified at build time
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/graphql",
  },

  // Configure webpack to handle specific file types
  webpack(config) {
    return config;
  },
};

export default nextConfig;

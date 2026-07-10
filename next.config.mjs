/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep heavy Node-only packages out of the bundle; load them from
  // node_modules at runtime (required for ts-morph / neo4j on serverless).
  experimental: {
    serverComponentsExternalPackages: ["ts-morph", "neo4j-driver", "tar-stream"],
  },
};

export default nextConfig;

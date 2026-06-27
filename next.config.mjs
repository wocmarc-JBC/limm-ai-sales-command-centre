/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/command-core",
        permanent: false
      }
    ];
  }
};

export default nextConfig;

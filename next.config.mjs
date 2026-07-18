/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
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

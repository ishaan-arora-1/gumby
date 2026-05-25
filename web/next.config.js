/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.fal.media' },
      { protocol: 'https', hostname: 'v3.fal.media' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
    ],
  },
};
module.exports = nextConfig;

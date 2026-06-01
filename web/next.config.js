/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next does NOT transpile node_modules by default. framer-motion ships
  // modern syntax that can fail to parse on older mobile Safari, which kills
  // the whole bundle and leaves the page rendered-but-not-interactive
  // (toggles/buttons dead) on those devices. Forcing it through the SWC
  // pipeline means it gets compiled down to our browserslist target.
  transpilePackages: ['framer-motion'],
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

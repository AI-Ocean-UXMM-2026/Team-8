import type { NextConfig } from 'next';

const config: NextConfig = {
  // The preserved runtime initializes once and owns its existing DOM subtree.
  reactStrictMode: false,
  poweredByHeader: false,
  experimental: {
    // Keep page generation within the memory available on deployment builders.
    cpus: 2,
  },
};

export default config;

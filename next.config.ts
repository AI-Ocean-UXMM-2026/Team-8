import type { NextConfig } from 'next';

const config: NextConfig = {
  // Browser fixtures use their own cache so the user's dev server can stay open.
  distDir: process.env.PARCELCARE_TEST_BUILD === '1' ? '.next-workflow-tests' : '.next',
  // The preserved runtime initializes once and owns its existing DOM subtree.
  reactStrictMode: false,
  poweredByHeader: false,
  experimental: {
    // Keep page generation within the memory available on deployment builders.
    cpus: 2,
  },
};

export default config;

import type { NextConfig } from 'next';

const config: NextConfig = {
  // The preserved runtime initializes once and owns its existing DOM subtree.
  reactStrictMode: false,
  poweredByHeader: false,
};

export default config;

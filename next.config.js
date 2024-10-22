/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    SITE_URL: process.env.SITE_URL,
    SITE_NAME: process.env.SITE_NAME,
  },
};

module.exports = nextConfig;

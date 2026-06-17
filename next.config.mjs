/** @type {import('next').NextConfig} */

// Static export: the whole app runs client-side (the engine computes in the browser), so it ships as
// static HTML/JS to any host. For GitHub Pages (a project subpath) set GITHUB_PAGES=true so the base
// path + asset prefix point at /<repo>; locally and on a root domain (e.g. Vercel) they stay at root.
const repo = 'retirement-planner';
const isPages = process.env.GITHUB_PAGES === 'true';

const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: { unoptimized: true },
  ...(isPages ? { basePath: `/${repo}`, assetPrefix: `/${repo}/` } : {}),
};

export default nextConfig;

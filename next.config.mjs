const productionBasePath = "/graphql/hive/federation-playground";
const basePath =
  process.env.NEXT_BASE_PATH ??
  (process.env.NODE_ENV === "production" ? productionBasePath : "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  assetPrefix: basePath || undefined,
  basePath,
  output: "export",
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

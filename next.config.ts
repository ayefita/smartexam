import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["@electric-sql/pglite", "exceljs", "pdf-lib", "@pdf-lib/fontkit", "nodemailer", "qrcode", "postgres"],
  outputFileTracingIncludes: {
    "/api/certificates/**": ["./assets/fonts/**"],
    "/api/reports/**": ["./assets/fonts/**"],
  },
};

export default nextConfig;

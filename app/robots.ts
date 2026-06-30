import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/supabase/env";

// This fork has no public marketing surface. Keep crawlers out of the
// authenticated app, auth handshakes, and APIs.
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl().replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: "/",
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}

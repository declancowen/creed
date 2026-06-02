import { NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/supabase/env";

// RFC 9728 protected-resource metadata. An MCP client that gets a 401 with a
// WWW-Authenticate header pointing here learns which authorization server
// guards the /mcp resource, then runs the OAuth flow against it. Public, no
// user data, fetched cross-origin by clients, so CORS is open.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const site = getSiteUrl().replace(/\/$/, "");
  return NextResponse.json(
    {
      resource: `${site}/mcp`,
      authorization_servers: [site],
      bearer_methods_supported: ["header"],
    },
    { headers: CORS_HEADERS }
  );
}

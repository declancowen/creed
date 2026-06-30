export const dynamic = "force-static";

export function GET() {
  const body = `# Creed

Creed is invite-only. Public marketing pages are not exposed.
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

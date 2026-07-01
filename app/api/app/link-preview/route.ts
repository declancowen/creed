import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { requireApiAuth } from "@/lib/api-auth";
import { isHttpUrl, urlHostname } from "@/lib/url-reference";
import { log } from "@/lib/observability";

// Fetches lightweight Open Graph / <title> metadata for an external URL so the
// editor can render bookmark cards and mention chips with a title, description
// and favicon. Session-authed (requireApiAuth) and hardened against SSRF: only
// http(s), no private / loopback / link-local addresses, short timeout, capped
// body read. The final URL host is re-validated after redirects.

export const runtime = "nodejs";

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 512 * 1024; // 512KB of HTML is plenty for <head> metadata.

// Block obvious internal targets. Covers loopback, RFC1918, link-local,
// unique-local IPv6 and the metadata service IP used by cloud providers.
function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split(".").map(Number);
    const [a, b] = octets;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80") ||
      lower.startsWith("::ffff:")
    );
  }
  return false;
}

async function assertPublicHost(hostname: string): Promise<boolean> {
  const bare = hostname.toLowerCase();
  if (bare === "localhost" || bare.endsWith(".local") || bare.endsWith(".internal")) {
    return false;
  }
  // If the host is already an IP literal, check it directly; otherwise resolve.
  if (isIP(bare)) return !isPrivateAddress(bare);
  try {
    const results = await lookup(bare, { all: true });
    if (results.length === 0) return false;
    return results.every((entry) => !isPrivateAddress(entry.address));
  } catch {
    return false;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function metaContent(html: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return decodeEntities(match[1].trim());
  }
  return null;
}

function extractMetadata(html: string, baseUrl: string) {
  const title =
    metaContent(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
      /<title[^>]*>([^<]+)<\/title>/i,
    ]) ?? urlHostname(baseUrl);

  const description = metaContent(html, [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i,
  ]);

  const image = metaContent(html, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ]);

  const resolve = (value: string | null) => {
    if (!value) return null;
    try {
      return new URL(value, baseUrl).toString();
    } catch {
      return null;
    }
  };

  return {
    title: title.slice(0, 300),
    description: description ? description.slice(0, 500) : null,
    image: resolve(image),
    // Favicons are served through Google's stateless favicon service so we
    // never have to fetch + proxy binary icon data ourselves.
    favicon: `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(urlHostname(baseUrl))}`,
  };
}

export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url).searchParams.get("url");
  if (!url || !isHttpUrl(url)) {
    return NextResponse.json({ error: "A valid http(s) url is required" }, { status: 400 });
  }

  const target = new URL(url);
  if (!(await assertPublicHost(target.hostname))) {
    return NextResponse.json({ error: "URL host is not allowed" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "CreedLinkPreview/1.0 (+https://creed.md)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok || !response.body) {
      return NextResponse.json(
        { url: target.toString(), ...extractMetadata("", target.toString()) },
        { headers: { "cache-control": "private, max-age=3600" } }
      );
    }

    // Read at most MAX_BYTES so a hostile server can't stream us forever.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      html += decoder.decode(value, { stream: true });
      // The metadata we need lives in <head>; stop once we have it or hit cap.
      if (received >= MAX_BYTES || /<\/head>/i.test(html)) {
        await reader.cancel().catch(() => {});
        break;
      }
    }

    const metadata = extractMetadata(html, target.toString());
    return NextResponse.json(
      { url: target.toString(), ...metadata },
      { headers: { "cache-control": "private, max-age=3600" } }
    );
  } catch (error) {
    log.warn("link_preview_failed", { hostname: target.hostname, error: String(error) });
    return NextResponse.json(
      { url: target.toString(), ...extractMetadata("", target.toString()) },
      { headers: { "cache-control": "private, max-age=600" } }
    );
  } finally {
    clearTimeout(timeout);
  }
}

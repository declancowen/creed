"use client";

// Client-side cache for external link metadata (title, description, image,
// favicon) used by the URL reference node views (mention chip / bookmark card).
// Fetches once per URL from /api/app/link-preview and shares the result across
// every node view that references the same URL, like document-reference-index.

import { urlHostname } from "@/lib/url-reference";

export type LinkPreview = {
  url: string;
  title: string;
  description: string | null;
  image: string | null;
  favicon: string | null;
};

type Listener = () => void;

const cache = new Map<string, LinkPreview>();
const inFlight = new Map<string, Promise<void>>();
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

// A synchronous best-effort preview so a chip/card renders immediately (host +
// favicon) while the real metadata is fetched in the background.
function fallbackPreview(url: string): LinkPreview {
  const host = urlHostname(url);
  return {
    url,
    title: host,
    description: null,
    image: null,
    favicon: `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`,
  };
}

export function resolveLinkPreview(url: string): LinkPreview {
  return cache.get(url) ?? fallbackPreview(url);
}

export function ensureLinkPreview(url: string): Promise<void> {
  if (cache.has(url)) return Promise.resolve();
  const existing = inFlight.get(url);
  if (existing) return existing;

  const request = fetch(`/api/app/link-preview?url=${encodeURIComponent(url)}`, {
    headers: { accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`link-preview ${response.status}`);
      const data = (await response.json()) as Partial<LinkPreview>;
      cache.set(url, {
        url,
        title: data.title || urlHostname(url),
        description: data.description ?? null,
        image: data.image ?? null,
        favicon: data.favicon ?? fallbackPreview(url).favicon,
      });
      emit();
    })
    .catch(() => {
      // Cache the fallback so we don't hammer a failing endpoint on every
      // subscription tick; the host + favicon are still useful.
      cache.set(url, fallbackPreview(url));
      emit();
    })
    .finally(() => {
      inFlight.delete(url);
    });

  inFlight.set(url, request);
  return request;
}

export function subscribeLinkPreview(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

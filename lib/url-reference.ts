// External URL reference tokens.
//
// A URL reference lets a document/Creed section point at an external web page
// in one of three shapes, mirroring Notion's "paste a link" menu:
//
//   Mention  (inline):     [mention](https://example.com)
//   Bookmark (block card):  [bookmark](https://example.com)   on its own line
//   Embed    (block, full-width iframe): [embed](https://example.com)  on its own line
//
// A plain hyperlink stays as ordinary Markdown (`[label](url)` / bare url) and
// is NOT one of these forms. We reuse Markdown link syntax with a reserved
// label so the URL lives inside the parens where it round-trips safely (no
// clash with the `[[doc:slug]]` reference tokens, which can't hold a URL).
//
// This module is runtime-agnostic (no DOM, no client-only imports) so the
// Markdown parser (lib/rich-text.ts), the serialiser (lib/creed-data.ts) and
// the MCP layer can all share it.

export const URL_REFERENCE_FORMS = ["mention", "bookmark", "embed"] as const;
export type UrlReferenceForm = (typeof URL_REFERENCE_FORMS)[number];

export function isUrlReferenceForm(value: unknown): value is UrlReferenceForm {
  return (
    typeof value === "string" && (URL_REFERENCE_FORMS as readonly string[]).includes(value)
  );
}

// Only http(s) URLs are accepted. Anything else (javascript:, data:, mailto:)
// is rejected so a reference can never smuggle an unsafe scheme into an href
// or iframe src.
export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function urlReferenceToken(form: UrlReferenceForm, url: string): string {
  return `[${form}](${url})`;
}

// A URL body inside `(...)` - no whitespace and no closing paren, matching how
// Markdown link destinations are delimited.
const URL_BODY = "https?:\\/\\/[^\\s)]+";

// Inline mention token, e.g. `[mention](https://example.com)`.
export const INLINE_URL_MENTION_PATTERN = new RegExp(
  `\\[mention\\]\\((${URL_BODY})\\)`,
  "g"
);

// A whole line that is just a bookmark/embed token, used by the block parser
// to promote it to a card / iframe node.
export const URL_BLOCK_LINE_PATTERN = new RegExp(
  `^\\[(bookmark|embed)\\]\\((${URL_BODY})\\)$`
);

// Hostname for favicon lookups + compact labels. Falls back to the raw string
// if the URL cannot be parsed.
export function urlHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

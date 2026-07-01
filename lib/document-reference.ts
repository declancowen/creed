// Shared document/folder reference tokens.
//
// A reference lets one document point at another document or a folder. The
// canonical, agent-facing representation is a compact Markdown token that
// survives the HTML <-> Markdown round-trip (it is plain text, so `stripTags`
// never mangles it) and is trivially readable + writable by MCP agents and in
// AGENTS.md / CLAUDE.md:
//
//   Inline chip:   [[doc:some-slug]]     [[folder:some-slug]]
//   Full-width card: ![[doc:some-slug]]  ![[folder:some-slug]]
//
// The `!` prefix mirrors Obsidian's embed convention: a plain link renders as
// a small inline chip; the `!` embed renders as a full-width card (title +
// description + property pills), matching the dashboard document card.
//
// This module is runtime-agnostic (no DOM, no client-only imports) so it can
// be shared by the Markdown parser (lib/rich-text.ts), the serialiser
// (lib/creed-data.ts), and the MCP layer.

export const DOC_REFERENCE_KINDS = ["doc", "folder"] as const;
export type DocReferenceKind = (typeof DOC_REFERENCE_KINDS)[number];

export type DocReferenceForm = "inline" | "card";

export type DocReferenceToken = {
  kind: DocReferenceKind;
  slug: string;
  form: DocReferenceForm;
};

// Slugs are produced by `slugify` (lowercase alphanumerics + hyphens) but we
// accept a slightly broader set so hand-authored tokens with dots or nested
// paths still resolve.
const SLUG_CHARS = "[a-zA-Z0-9][a-zA-Z0-9._/-]*";
const KIND_GROUP = DOC_REFERENCE_KINDS.join("|");

// Inline token: `[[doc:slug]]`. The negative lookbehind on `!` keeps the card
// form (`![[...]]`) from also matching the inline pattern.
export const INLINE_REFERENCE_PATTERN = new RegExp(
  `(?<!\\!)\\[\\[(${KIND_GROUP}):(${SLUG_CHARS})\\]\\]`,
  "g"
);

// Card token: `![[doc:slug]]`.
export const CARD_REFERENCE_PATTERN = new RegExp(
  `\\!\\[\\[(${KIND_GROUP}):(${SLUG_CHARS})\\]\\]`,
  "g"
);

// A whole line that is nothing but a card token (optionally surrounded by
// whitespace). Used by the block parser to promote it to a card node.
export const CARD_REFERENCE_LINE_PATTERN = new RegExp(
  `^\\!\\[\\[(${KIND_GROUP}):(${SLUG_CHARS})\\]\\]$`
);

export function isDocReferenceKind(value: unknown): value is DocReferenceKind {
  return typeof value === "string" && (DOC_REFERENCE_KINDS as readonly string[]).includes(value);
}

export function referenceToken(kind: DocReferenceKind, slug: string, form: DocReferenceForm) {
  const body = `[[${kind}:${slug}]]`;
  return form === "card" ? `!${body}` : body;
}

// Where a reference points in the product. Documents open in the file editor;
// folders open the dashboard folder view.
export function referenceHref(kind: DocReferenceKind, slug: string) {
  const safeSlug = encodeURIComponent(slug);
  return kind === "folder"
    ? `/dashboard/folder/${safeSlug}`
    : `/file?document=${safeSlug}`;
}

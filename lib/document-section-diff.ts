// Splits Markdown into heading-scoped sections and diffs two versions of a
// document section-by-section, so the review UI can tie each change to the
// section it lives in. Documents in the workspace have dynamic, arbitrarily
// nested headings (unlike the fixed personal-profile sections), so this is
// framework-free and driven purely by ATX headings in the Markdown body.
//
// Pure and dependency-free on purpose: it is imported by the client review
// panel and is trivially unit-testable in isolation.

export type MarkdownSection = {
  // Stable identity used to match a section across two versions. Built from the
  // heading text + level (+ an occurrence index to disambiguate duplicates).
  key: string;
  // Display heading text ("" for the preamble that precedes the first heading).
  heading: string;
  // 0 for the preamble, 1-6 for an ATX heading (`#`..`######`).
  level: number;
  // The section's full text, including its own heading line.
  body: string;
};

export type SectionChangeStatus = "added" | "removed" | "modified" | "unchanged";

export type SectionChange = {
  key: string;
  heading: string;
  level: number;
  status: SectionChangeStatus;
  before: string;
  after: string;
  proposedIndex: number | null;
  previousKey: string | null;
  nextKey: string | null;
};

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;
const PREAMBLE_KEY = "__preamble__";

function normalizeHeading(heading: string) {
  return heading.trim().toLowerCase();
}

function splitTableCells(row: string) {
  let text = row.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|")) text = text.slice(0, -1);
  return text
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}

function isTableDelimiterRow(line: string | undefined) {
  if (!line) return false;
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  return splitTableCells(trimmed).every((cell) => /^:?-+:?$/.test(cell));
}

function formatMarkdownTableForReview(rows: string[]) {
  const parsed = rows.map(splitTableCells);
  const colCount = Math.max(...parsed.map((row) => row.length), 0);
  const widths = Array.from({ length: colCount }, (_unused, index) =>
    Math.max(...parsed.map((row) => row[index]?.length ?? 0), 3)
  );
  return parsed
    .map((row, rowIndex) => {
      if (rowIndex === 1) {
        return `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
      }
      return `| ${widths.map((width, index) => (row[index] ?? "").padEnd(width)).join(" | ")} |`;
    })
    .join("\n");
}

function formatTablesForReview(md: string) {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let index = 0;
  let inCodeBlock = false;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      out.push(line);
      index += 1;
      continue;
    }

    if (!inCodeBlock && trimmed.includes("|") && isTableDelimiterRow(lines[index + 1])) {
      const tableRows = [line, lines[index + 1] ?? ""];
      index += 2;
      while (index < lines.length) {
        const next = lines[index] ?? "";
        const nextTrimmed = next.trim();
        if (!nextTrimmed || !nextTrimmed.includes("|") || nextTrimmed.startsWith("```")) break;
        tableRows.push(next);
        index += 1;
      }
      out.push(formatMarkdownTableForReview(tableRows));
      continue;
    }

    out.push(line);
    index += 1;
  }

  return out.join("\n");
}

export function markdownToReviewText(md: string) {
  return formatTablesForReview(md)
    .replace(/\r\n/g, "\n")
    .replace(/^\uFEFF/, "")
    .replace(/^```mermaid\s*$/gm, "Diagram:")
    .replace(/```[^\n]*\n?/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)([^*_]+?)\1/g, "$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasReviewableMarkdownChange(before: string, after: string) {
  return markdownToReviewText(before) !== markdownToReviewText(after);
}

export function sectionChangeHasReviewableDiff(change: Pick<SectionChange, "status" | "before" | "after">) {
  if (change.status === "added") {
    return markdownToReviewText(change.after).length > 0;
  }
  if (change.status === "removed") {
    return markdownToReviewText(change.before).length > 0;
  }
  if (change.status === "modified") {
    return hasReviewableMarkdownChange(change.before, change.after);
  }
  return false;
}

// A section span over the raw lines of a document. Carries the line range so a
// single section can be spliced back into the original text without disturbing
// any other section (the diff/split path only needs `body`, but the apply path
// needs to know exactly which lines to replace).
type SectionSpan = {
  key: string;
  heading: string;
  level: number;
  // Inclusive start line (the heading line, or 0 for the preamble) and
  // exclusive end line (the start of the next section, or lines.length).
  startLine: number;
  endLine: number;
  body: string;
  // An empty preamble is tracked as a span (so line ranges stay contiguous) but
  // never emitted as a real section - it carries no key identity.
  isEmptyPreamble: boolean;
};

// The single scanner both the split/diff path and the apply/splice path share,
// so a section's key here is byte-for-byte the key used everywhere else
// (`section_id`, diff matching, etc.).
function scanSectionSpans(markdown: string): { lines: string[]; spans: SectionSpan[] } {
  const normalized = (markdown ?? "").replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
  const lines = normalized.split("\n");

  const spans: SectionSpan[] = [];
  const seen = new Map<string, number>();

  let startLine = 0;
  let currentHeading = "";
  let currentLevel = 0;

  const flush = (endLine: number) => {
    const body = lines.slice(startLine, endLine).join("\n").replace(/^\n+/, "").replace(/\s+$/, "");
    const isEmptyPreamble = currentLevel === 0 && body.trim().length === 0;
    const baseKey =
      currentLevel === 0 ? PREAMBLE_KEY : `h${currentLevel}:${normalizeHeading(currentHeading)}`;
    let key = baseKey;
    // Occurrence counting must mirror the historical behaviour: an empty
    // preamble is skipped and never advances the counter, so heading keys stay
    // stable regardless of whether a preamble exists.
    if (!isEmptyPreamble) {
      const occurrence = seen.get(baseKey) ?? 0;
      seen.set(baseKey, occurrence + 1);
      key = occurrence === 0 ? baseKey : `${baseKey}#${occurrence}`;
    }
    spans.push({ key, heading: currentHeading, level: currentLevel, startLine, endLine, body, isEmptyPreamble });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const match = HEADING_RE.exec(lines[index]);
    if (match) {
      flush(index);
      startLine = index;
      currentHeading = match[2].trim();
      currentLevel = match[1].length;
    }
  }
  flush(lines.length);

  return { lines, spans };
}

// Split a Markdown body into ordered sections. Everything before the first
// heading becomes a single preamble section (only emitted when it has content);
// every heading starts a new section whose body runs until the next heading.
export function splitMarkdownSections(markdown: string): MarkdownSection[] {
  return scanSectionSpans(markdown)
    .spans.filter((span) => !span.isEmptyPreamble)
    .map(({ key, heading, level, body }) => ({ key, heading, level, body }));
}

// Diff two Markdown bodies section-by-section. Sections are matched by key;
// the result follows the "after" reading order, with removed sections appended
// in their original order so nothing is silently dropped.
export function diffMarkdownSections(before: string, after: string): SectionChange[] {
  const beforeSections = splitMarkdownSections(before);
  const afterSections = splitMarkdownSections(after);

  const beforeByKey = new Map(beforeSections.map((section) => [section.key, section]));
  const afterKeys = new Set(afterSections.map((section) => section.key));

  const changes: SectionChange[] = [];

  for (const [index, section] of afterSections.entries()) {
    const previous = beforeByKey.get(section.key);
    const previousKey = afterSections[index - 1]?.key ?? null;
    const nextKey = afterSections[index + 1]?.key ?? null;
    if (!previous) {
      changes.push({
        key: section.key,
        heading: section.heading,
        level: section.level,
        status: "added",
        before: "",
        after: section.body,
        proposedIndex: index,
        previousKey,
        nextKey,
      });
      continue;
    }
    const status: SectionChangeStatus =
      previous.body.trim() === section.body.trim() ||
      !hasReviewableMarkdownChange(previous.body, section.body)
        ? "unchanged"
        : "modified";
    changes.push({
      key: section.key,
      heading: section.heading,
      level: section.level,
      status,
      before: previous.body,
      after: section.body,
      proposedIndex: index,
      previousKey,
      nextKey,
    });
  }

  for (const [index, section] of beforeSections.entries()) {
    if (afterKeys.has(section.key)) continue;
    changes.push({
      key: section.key,
      heading: section.heading,
      level: section.level,
      status: "removed",
      before: section.body,
      after: "",
      proposedIndex: afterSections.length + index,
      previousKey: beforeSections[index - 1]?.key ?? null,
      nextKey: beforeSections[index + 1]?.key ?? null,
    });
  }

  return changes;
}

// A friendly label for a section change row. The preamble has no heading, so
// it reads as "Intro"; real sections use their heading text.
export function sectionChangeLabel(change: Pick<SectionChange, "heading" | "level">) {
  if (change.level === 0 || !change.heading) {
    return "Intro";
  }
  return change.heading;
}

export type ApplySectionResult =
  | { ok: true; content: string }
  | { ok: false; reason: "conflict" };

export type ApplySectionOptions = {
  allowStaleSectionUpdate?: boolean;
};

// Insert a brand-new section into `content`. A preamble (level 0) goes to the
// top; every other section lands next to the nearest proposed sibling that
// still exists in the live document, so accepting added sections out of order
// does not scramble the document's reading order.
function joinMarkdownBlocks(head: string, middle: string, tail: string) {
  return [
    head.replace(/\s+$/, ""),
    middle.replace(/\s+$/, ""),
    tail.replace(/^\s+/, "").replace(/\s+$/, ""),
  ]
    .filter((block) => block.length > 0)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+$/, "");
}

function insertSection(
  content: string,
  change: Pick<SectionChange, "level" | "after" | "previousKey" | "nextKey">
): string {
  const sectionText = change.after.replace(/\s+$/, "");
  if (change.level === 0) {
    const rest = content.replace(/^\s+/, "");
    return rest.length ? `${sectionText}\n\n${rest}` : sectionText;
  }

  const { lines, spans } = scanSectionSpans(content);
  const findSpan = (key: string | null) =>
    key ? spans.find((span) => !span.isEmptyPreamble && span.key === key) : undefined;

  const previous = findSpan(change.previousKey);
  if (previous) {
    return joinMarkdownBlocks(
      lines.slice(0, previous.endLine).join("\n"),
      sectionText,
      lines.slice(previous.endLine).join("\n")
    );
  }

  const next = findSpan(change.nextKey);
  if (next) {
    return joinMarkdownBlocks(
      lines.slice(0, next.startLine).join("\n"),
      sectionText,
      lines.slice(next.startLine).join("\n")
    );
  }

  return joinMarkdownBlocks(content, sectionText, "");
}

// Replace (or, when `replacement` is null, remove) a single section identified
// by `key`, preserving every other line of the document verbatim. Returns null
// when the section is not present so the caller can treat it as a conflict.
export function replaceSectionInMarkdown(
  content: string,
  key: string,
  replacement: string | null
): string | null {
  const { lines, spans } = scanSectionSpans(content);
  const target = spans.find((span) => !span.isEmptyPreamble && span.key === key);
  if (!target) {
    return null;
  }

  const before = lines.slice(0, target.startLine);
  const after = lines.slice(target.endLine);

  if (replacement === null) {
    // Removal: drop the section's lines. `after` begins with the next heading
    // (trailing blanks belonged to the removed span), so the seam collapses to
    // whatever separator `before` already ended with.
    const merged = [...before, ...after].join("\n").replace(/\n{3,}/g, "\n\n");
    return merged.replace(/\s+$/, "");
  }

  const replacementLines = replacement.replace(/\s+$/, "").split("\n");
  // Keep exactly one blank line before the following section.
  const separator = after.length > 0 ? [""] : [];
  const merged = [...before, ...replacementLines, ...separator, ...after].join("\n");
  return merged.replace(/\n{3,}/g, "\n\n");
}

// Apply one section-scoped change to `content` with a per-section merge guard:
// the change lands only when the section is still exactly as the proposal's
// author saw it (`before`), so sibling section proposals from the same edit can
// be accepted independently even as each acceptance advances the document. A
// change that is already satisfied is a no-op success (idempotent); a section
// that moved underneath the proposal is a conflict.
export function applySectionChange(
  content: string,
  change: SectionChange,
  options: ApplySectionOptions = {}
): ApplySectionResult {
  const { spans } = scanSectionSpans(content);
  const existing = spans.find((span) => !span.isEmptyPreamble && span.key === change.key);

  if (change.status === "added") {
    if (existing) {
      // Someone already added a section with this identity. Fine if it matches
      // what we wanted; otherwise treat this proposal as an update to the
      // now-real section. This covers repeated proposal updates to the same new
      // section before any of them are accepted.
      if (existing.body.trim() === change.after.trim()) {
        return { ok: true, content };
      }
      const next = replaceSectionInMarkdown(content, change.key, change.after);
      return next === null ? { ok: false, reason: "conflict" } : { ok: true, content: next };
    }
    return { ok: true, content: insertSection(content, change) };
  }

  if (change.status === "removed") {
    if (!existing) {
      // Already gone: the desired end state is reached.
      return { ok: true, content };
    }
    if (existing.body.trim() !== change.before.trim() && !options.allowStaleSectionUpdate) {
      return { ok: false, reason: "conflict" };
    }
    const next = replaceSectionInMarkdown(content, change.key, null);
    return next === null ? { ok: false, reason: "conflict" } : { ok: true, content: next };
  }

  // modified (or an "unchanged" row accepted defensively).
  if (!existing) {
    if (options.allowStaleSectionUpdate && change.after.trim()) {
      return { ok: true, content: insertSection(content, change) };
    }
    return { ok: false, reason: "conflict" };
  }
  if (existing.body.trim() === change.after.trim()) {
    return { ok: true, content };
  }
  if (existing.body.trim() !== change.before.trim() && !options.allowStaleSectionUpdate) {
    return { ok: false, reason: "conflict" };
  }
  const next = replaceSectionInMarkdown(content, change.key, change.after);
  return next === null ? { ok: false, reason: "conflict" } : { ok: true, content: next };
}

import { buildVisibleCreedMarkdown, type CreedSection } from "@/lib/creed-data";
import { parseCreedMarkdown } from "@/lib/creed-markdown";

export function parseDocumentSections(markdown: string): CreedSection[] {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  const withoutDocumentTitle = normalized.replace(/^#\s+.+\n?/i, "");
  const parsed = parseCreedMarkdown(withoutDocumentTitle.trim());
  if (parsed.sections.length > 0) {
    return parsed.sections;
  }

  return [
    {
      id: "document",
      kind: "rich-text",
      template: "freeform",
      name: "Overview",
      accent: "identity",
      content: "Start shaping this document.",
      agentWritable: true,
      agentPermission: "propose",
      lastEditedBy: "Creed",
      lastEditedType: "user",
      lastEditedLabel: "just now",
    },
  ];
}

export function documentSectionsToMarkdown(sections: CreedSection[], title?: string) {
  const body = buildVisibleCreedMarkdown(sections).trim();
  const heading = title?.trim();
  if (!heading) {
    return body ? `${body}\n` : "";
  }
  return body ? `# ${heading}\n\n${body}\n` : `# ${heading}\n`;
}

import { describe, expect, it } from "vitest";

import { parseDocumentFile, serializeDocumentFile } from "@/lib/document-markdown";

const source = {
  title: "My Document",
  description: "A short description: with a colon.",
  documentType: "feature",
  status: "backlog",
  stage: "discovery",
  lifecycle: "ideation",
  priority: "medium",
  size: "m",
};

describe("serializeDocumentFile / parseDocumentFile round-trip", () => {
  it("recovers the metadata and body from a serialized file", () => {
    const body = "# Heading\n\nBody paragraph with content.";
    const file = serializeDocumentFile(source, body);
    const parsed = parseDocumentFile(file);

    expect(parsed.metadata.title).toBe(source.title);
    expect(parsed.metadata.description).toBe(source.description);
    expect(parsed.metadata.documentType).toBe("feature");
    expect(parsed.metadata.status).toBe("backlog");
    expect(parsed.metadata.stage).toBe("discovery");
    expect(parsed.metadata.lifecycle).toBe("ideation");
    expect(parsed.metadata.priority).toBe("medium");
    expect(parsed.metadata.size).toBe("m");
    expect(parsed.body).toBe(body);
  });

  it("preserves a thematic break (---) that appears inside the body", () => {
    const body = "Section one\n\n---\n\nSection two";
    const file = serializeDocumentFile(source, body);
    const parsed = parseDocumentFile(file);

    expect(parsed.metadata.title).toBe(source.title);
    expect(parsed.body).toBe(body);
    expect(parsed.body).toContain("---");
  });

  it("omits missing optional properties from serialized frontmatter", () => {
    const file = serializeDocumentFile(
      {
        title: "No Properties",
        documentType: null,
        status: null,
        stage: null,
        lifecycle: null,
        priority: null,
        size: null,
      },
      "# Body"
    );

    expect(file).toContain('title: "No Properties"');
    expect(file).not.toContain("type:");
    expect(file).not.toContain("status:");
    expect(file).not.toContain("stage:");
    expect(parseDocumentFile(file).metadata.title).toBe("No Properties");
  });
});

describe("parseDocumentFile frontmatter guard", () => {
  it("does not treat a leading stray `---` block as frontmatter", () => {
    // Starts with a fence but the block is prose, not key: value pairs.
    const fileText = "---\nJust a thematic break\nnot frontmatter\n---\n\nBody text.";
    const parsed = parseDocumentFile(fileText);

    expect(Object.keys(parsed.metadata)).toHaveLength(0);
    // The whole thing stays in the body, fence included.
    expect(parsed.body).toContain("---");
    expect(parsed.body).toContain("Just a thematic break");
  });

  it("ignores a fenced block with pairs but no recognized document key", () => {
    const fileText = "---\nfoo: bar\nbaz: qux\n---\n\nBody.";
    const parsed = parseDocumentFile(fileText);

    expect(Object.keys(parsed.metadata)).toHaveLength(0);
    expect(parsed.body).toContain("foo: bar");
  });

  it("returns body untouched when there is no frontmatter at all", () => {
    const fileText = "# Just a document\n\nNo frontmatter here.";
    const parsed = parseDocumentFile(fileText);

    expect(Object.keys(parsed.metadata)).toHaveLength(0);
    expect(parsed.body).toBe(fileText);
  });
});

import { describe, expect, it } from "vitest";
import { richHtmlToMarkdown } from "@/lib/creed-data";
import { markdownToRichHtml } from "@/lib/rich-text";

describe("rich text hard breaks", () => {
  it("serializes Tiptap hard breaks as Markdown hard breaks", () => {
    const markdown = richHtmlToMarkdown(
      "<p>Creator Program terms.<br>Testing</p><p>The proposed payment model starts here.</p>"
    );

    expect(markdown).toBe(
      "Creator Program terms.\\\nTesting\n\nThe proposed payment model starts here."
    );
  });

  it("renders Markdown hard breaks inside one paragraph", () => {
    const html = markdownToRichHtml(
      "Creator Program terms.\\\nTesting\n\nThe proposed payment model starts here."
    );

    expect(html).toBe(
      "<p>Creator Program terms.<br>Testing</p><p>The proposed payment model starts here.</p>"
    );
  });

  it("keeps ordinary wrapped paragraph lines as prose", () => {
    expect(markdownToRichHtml("Creator Program terms.\nTesting")).toBe(
      "<p>Creator Program terms. Testing</p>"
    );
  });
});

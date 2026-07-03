import { describe, expect, it } from "vitest";

import {
  appendDocumentVersion,
  listDocumentVersions,
  readDocumentVersion,
} from "@/lib/document-versions";
import { FakeSupabaseClient } from "./helpers/fake-supabase";

describe("document-versions", () => {
  it("appends an immutable version and maps it back", async () => {
    const client = new FakeSupabaseClient();
    const version = await appendDocumentVersion(client, {
      documentId: "doc-1",
      revision: 2,
      content: "# Body v2",
      actorType: "agent",
      authorAgentLabel: "Codex",
      summary: "Applied agent edit",
      sourceProposalId: "prop-9",
    });

    expect(version.documentId).toBe("doc-1");
    expect(version.revision).toBe(2);
    expect(version.actorType).toBe("agent");
    expect(version.authorAgentLabel).toBe("Codex");
    expect(version.sourceProposalId).toBe("prop-9");
    expect(client.count("creed_document_versions")).toBe(1);
  });

  it("includes the source proposal family on version summaries", async () => {
    const client = new FakeSupabaseClient();
    client.seed("creed_document_proposals", [
      {
        id: "prop-9",
        family_id: "family-1",
      },
    ]);
    await appendDocumentVersion(client, {
      documentId: "doc-1",
      revision: 2,
      content: "v2",
      actorType: "agent",
      authorAgentLabel: "Codex",
      summary: "Applied proposal",
      sourceProposalId: "prop-9",
    });

    const versions = await listDocumentVersions(client, "doc-1");
    expect(versions[0]?.sourceProposalFamilyId).toBe("family-1");

    const read = await readDocumentVersion(client, { documentId: "doc-1", versionId: versions[0]?.id ?? "" });
    expect(read?.sourceProposalFamilyId).toBe("family-1");
  });

  it("lists versions newest-first by revision and reads one by id", async () => {
    const client = new FakeSupabaseClient();
    await appendDocumentVersion(client, {
      documentId: "doc-1",
      revision: 1,
      content: "v1",
      actorType: "human",
      authorUserId: "u-1",
      summary: "first",
    });
    const v2 = await appendDocumentVersion(client, {
      documentId: "doc-1",
      revision: 2,
      content: "v2",
      actorType: "human",
      authorUserId: "u-1",
      summary: "second",
    });
    // A version for a different document must not leak into the list.
    await appendDocumentVersion(client, {
      documentId: "doc-2",
      revision: 1,
      content: "other",
      actorType: "human",
      authorUserId: "u-2",
      summary: "other doc",
    });

    const versions = await listDocumentVersions(client, "doc-1");
    expect(versions.map((v) => v.revision)).toEqual([2, 1]);

    const read = await readDocumentVersion(client, { documentId: "doc-1", versionId: v2.id });
    expect(read?.content).toBe("v2");

    const missing = await readDocumentVersion(client, { documentId: "doc-1", versionId: "nope" });
    expect(missing).toBeNull();
  });
});

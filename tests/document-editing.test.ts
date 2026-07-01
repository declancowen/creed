import { describe, expect, it, vi } from "vitest";

// document-editing calls recordDocumentActivity from lib/document-collaboration,
// which transitively imports notification-email / shared-documents helpers we
// don't want to load under test. Mock the whole module to a no-op.
vi.mock("@/lib/document-collaboration", () => ({
  recordDocumentActivity: vi.fn(async () => {}),
}));

import {
  acceptDocumentProposal,
  listDocumentProposals,
  rejectDocumentProposal,
  revertDocumentToVersion,
  routeDocumentEdit,
} from "@/lib/document-editing";
import type { ActorType, EditPolicyValue } from "@/lib/workspace-settings";
import {
  createFakeClientWithDocument,
  FakeSupabaseClient,
} from "./helpers/fake-supabase";

function setPolicy(
  client: FakeSupabaseClient,
  policy: { human?: EditPolicyValue; agent?: EditPolicyValue }
) {
  client.seed("creed_workspace_settings", [
    {
      id: true,
      human_edit_policy: policy.human ?? "propose",
      agent_edit_policy: policy.agent ?? "propose",
    },
  ]);
}

const VERSIONS = "creed_document_versions";
const DOCS = "creed_documents";

describe("Property 1: policy determinism", () => {
  const actorTypes: ActorType[] = ["human", "agent"];
  const policies: EditPolicyValue[] = ["cant-edit", "propose", "direct"];

  for (const actorType of actorTypes) {
    for (const policy of policies) {
      it(`${actorType} + ${policy} yields the one correct outcome`, async () => {
        const { client, documentId } = createFakeClientWithDocument();
        setPolicy(client, { human: policy, agent: policy });

        const result = await routeDocumentEdit(client, {
          documentId,
          actorType,
          author: { userId: "u-1", agentLabel: actorType === "agent" ? "Codex" : null },
          content: "# Test Doc\nEdited body.",
          expectedRevision: 1,
          summary: "edit",
        });

        if (policy === "cant-edit") {
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.code).toBe("forbidden");
        } else if (policy === "propose") {
          expect(result.ok).toBe(true);
          if (result.ok) expect(result.outcome).toBe("proposed");
        } else {
          expect(result.ok).toBe(true);
          if (result.ok) expect(result.outcome).toBe("applied");
        }
      });
    }
  }
});

describe("Property 2: version-per-apply", () => {
  it("a direct edit appends exactly one version and advances revision by 1", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "direct" });

    const result = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "u-1" },
      content: "# Test Doc\nDirect edit.",
      expectedRevision: 1,
      summary: "direct edit",
    });

    expect(result.ok).toBe(true);
    expect(client.count(VERSIONS)).toBe(1);
    expect(client.rows(DOCS)[0].revision).toBe(2);
  });

  it("an accepted proposal appends exactly one version and advances revision by 1", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "propose" });

    const proposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "author-A" },
      content: "# Test Doc\nProposed edit.",
      expectedRevision: 1,
      summary: "proposed edit",
    });
    expect(proposed.ok && proposed.outcome === "proposed").toBe(true);
    // Pending proposal has not applied a version yet.
    expect(client.count(VERSIONS)).toBe(0);

    const proposalId = proposed.ok && proposed.outcome === "proposed" ? proposed.proposal.id : "";
    const accepted = await acceptDocumentProposal(client, {
      documentId,
      proposalId,
      actorUserId: "user-B",
    });

    expect(accepted.ok).toBe(true);
    expect(client.count(VERSIONS)).toBe(1);
    expect(client.rows(DOCS)[0].revision).toBe(2);
  });
});

describe("Property 4: pending isolation", () => {
  it("creating a proposal does not change document content or revision", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "propose" });
    const before = client.rows(DOCS)[0];

    const proposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "u-1" },
      content: "# Test Doc\nTotally different content.",
      expectedRevision: 1,
      summary: "proposed",
    });

    expect(proposed.ok && proposed.outcome === "proposed").toBe(true);
    const after = client.rows(DOCS)[0];
    expect(after.content).toBe(before.content);
    expect(after.revision).toBe(before.revision);
    expect(client.count(VERSIONS)).toBe(0);
  });
});

describe("Property 5: at-most-once resolution", () => {
  it("a second accept of an already-accepted proposal conflicts; draft applied once", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "propose" });

    const proposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "author-A" },
      content: "# Test Doc\nProposed once.",
      expectedRevision: 1,
      summary: "proposed",
    });
    const proposalId = proposed.ok && proposed.outcome === "proposed" ? proposed.proposal.id : "";

    const first = await acceptDocumentProposal(client, { documentId, proposalId, actorUserId: "user-B" });
    const second = await acceptDocumentProposal(client, { documentId, proposalId, actorUserId: "user-C" });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("conflict");
    // Applied at most once.
    expect(client.count(VERSIONS)).toBe(1);
    expect(client.rows(DOCS)[0].revision).toBe(2);
  });

  it("rejecting an already-accepted proposal conflicts", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "propose" });

    const proposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "author-A" },
      content: "# Test Doc\nProposed.",
      expectedRevision: 1,
      summary: "proposed",
    });
    const proposalId = proposed.ok && proposed.outcome === "proposed" ? proposed.proposal.id : "";

    await acceptDocumentProposal(client, { documentId, proposalId, actorUserId: "user-B" });
    const rejected = await rejectDocumentProposal(client, { documentId, proposalId, actorUserId: "user-C" });

    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe("conflict");
  });
});

describe("Property 6: concurrency guard", () => {
  it("applying against a stale expectedRevision is rejected without mutating content", async () => {
    // Document is already at revision 2; a submit against revision 1 is stale.
    const { client, documentId } = createFakeClientWithDocument({ revision: 2, content: "# Test Doc\nCurrent." });
    setPolicy(client, { human: "direct" });
    const before = client.rows(DOCS)[0];

    const result = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "u-1" },
      content: "# Test Doc\nStale write.",
      expectedRevision: 1,
      summary: "stale",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("conflict");
    const after = client.rows(DOCS)[0];
    expect(after.content).toBe(before.content);
    expect(after.revision).toBe(2);
    expect(client.count(VERSIONS)).toBe(0);
  });

  it("accepting a proposal whose base_revision is stale is rejected", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "propose", agent: "direct" });

    // Author proposes against revision 1.
    const proposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "author-A" },
      content: "# Test Doc\nProposed against v1.",
      expectedRevision: 1,
      summary: "proposed",
    });
    const proposalId = proposed.ok && proposed.outcome === "proposed" ? proposed.proposal.id : "";

    // Meanwhile an agent applies a direct edit, moving the document to revision 2.
    await routeDocumentEdit(client, {
      documentId,
      actorType: "agent",
      author: { agentLabel: "Codex" },
      content: "# Test Doc\nAgent moved it on.",
      expectedRevision: 1,
      summary: "direct",
    });
    expect(client.rows(DOCS)[0].revision).toBe(2);

    const accepted = await acceptDocumentProposal(client, { documentId, proposalId, actorUserId: "user-B" });
    expect(accepted.ok).toBe(false);
    if (!accepted.ok) expect(accepted.code).toBe("conflict");
    // Only the agent's direct edit produced a version.
    expect(client.count(VERSIONS)).toBe(1);
  });
});

describe("Property 7: reject safety", () => {
  it("rejecting sets status rejected, appends no version, and keeps content", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "propose" });
    const before = client.rows(DOCS)[0];

    const proposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "author-A" },
      content: "# Test Doc\nShould never apply.",
      expectedRevision: 1,
      summary: "proposed",
    });
    const proposalId = proposed.ok && proposed.outcome === "proposed" ? proposed.proposal.id : "";

    const rejected = await rejectDocumentProposal(client, { documentId, proposalId, actorUserId: "user-B" });
    expect(rejected.ok).toBe(true);
    if (rejected.ok) expect(rejected.value.status).toBe("rejected");

    const after = client.rows(DOCS)[0];
    expect(after.content).toBe(before.content);
    expect(after.revision).toBe(before.revision);
    expect(client.count(VERSIONS)).toBe(0);

    // Rejected proposal is retrievable in history and not returned to pending.
    const pending = await listDocumentProposals(client, documentId, { status: "pending" });
    expect(pending).toHaveLength(0);
    const rejectedList = await listDocumentProposals(client, documentId, { status: "rejected" });
    expect(rejectedList).toHaveLength(1);
    expect(rejectedList[0].id).toBe(proposalId);
  });
});

describe("Property 8: attribution preservation", () => {
  it("a version from an accepted proposal is attributed to the proposal author", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "propose" });

    const proposed = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "author-A" },
      content: "# Test Doc\nBy author A.",
      expectedRevision: 1,
      summary: "proposed",
    });
    const proposalId = proposed.ok && proposed.outcome === "proposed" ? proposed.proposal.id : "";

    const accepted = await acceptDocumentProposal(client, { documentId, proposalId, actorUserId: "accepting-user-B" });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.value.version.authorUserId).toBe("author-A");
    }

    const versionRow = client.rows(VERSIONS)[0];
    expect(versionRow.author_user_id).toBe("author-A");
    expect(versionRow.source_proposal_id).toBe(proposalId);

    // The accepting member is recorded as the resolver, not the author.
    const proposalRow = client.rows("creed_document_proposals")[0];
    expect(proposalRow.resolved_by).toBe("accepting-user-B");
  });
});

describe("Property 3 (bonus): revert appends and never deletes", () => {
  it("reverting to a prior version yields the old content and a larger version count", async () => {
    const { client, documentId } = createFakeClientWithDocument();
    setPolicy(client, { human: "direct" });

    const first = await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "u-1" },
      content: "# Test Doc\nVersion two body.",
      expectedRevision: 1,
      summary: "edit 1",
    });
    expect(first.ok).toBe(true);
    const v2Id = first.ok && first.outcome === "applied" ? first.version.id : "";

    await routeDocumentEdit(client, {
      documentId,
      actorType: "human",
      author: { userId: "u-1" },
      content: "# Test Doc\nVersion three body.",
      expectedRevision: 2,
      summary: "edit 2",
    });
    expect(client.count(VERSIONS)).toBe(2);
    expect(client.rows(DOCS)[0].revision).toBe(3);

    const reverted = await revertDocumentToVersion(client, {
      documentId,
      versionId: v2Id,
      actorType: "human",
      author: { userId: "u-1" },
      expectedRevision: 3,
    });

    expect(reverted.ok).toBe(true);
    // Appended, not deleted: 3 versions now, revision 4, content back to v2 body.
    expect(client.count(VERSIONS)).toBe(3);
    expect(client.rows(DOCS)[0].revision).toBe(4);
    expect(client.rows(DOCS)[0].content).toBe("# Test Doc\nVersion two body.");
  });
});

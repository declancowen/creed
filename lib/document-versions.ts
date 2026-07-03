import "server-only";
import type { DocumentHunkChange, DocumentHunkConflictStatus, DocumentHunkStatus } from "@/lib/document-hunk-diff";
import type { ActorType } from "@/lib/workspace-settings";
import type { SupabaseLikeClient } from "@/lib/supabase/types";

// Append-only version history for shared documents. Every applied change
// (accepted proposal or direct edit) records one immutable version. This is the
// version-control layer that replaces the removed GitHub sync.

export type DocumentVersion = {
  id: string;
  documentId: string;
  revision: number;
  content: string;
  changeHunks: DocumentHunkChange[];
  actorType: ActorType;
  authorUserId: string | null;
  authorAgentLabel: string | null;
  summary: string;
  sourceProposalId: string | null;
  sourceProposalFamilyId: string | null;
  versionFamilyId: string | null;
  versionFamilyTitle: string;
  createdAt: string;
};

export type DocumentVersionSummary = Omit<DocumentVersion, "content"> & {
  content?: string;
};

type DocumentVersionRow = {
  id: string;
  document_id: string;
  revision: number;
  content: string | null;
  change_hunks?: unknown;
  actor_type: string;
  author_user_id: string | null;
  author_agent_label: string | null;
  summary: string | null;
  source_proposal_id: string | null;
  source_proposal_family_id?: string | null;
  version_family_id?: string | null;
  version_family_title?: string | null;
  created_at: string;
};

const VERSION_COLUMNS = [
  "id",
  "document_id",
  "revision",
  "content",
  "change_hunks",
  "actor_type",
  "author_user_id",
  "author_agent_label",
  "summary",
  "source_proposal_id",
  "version_family_id",
  "version_family_title",
  "created_at",
].join(", ");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string, fallback = "") {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function numberField(record: Record<string, unknown>, key: string, fallback = 0) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function hunkStatus(value: unknown): DocumentHunkStatus {
  return value === "added" || value === "removed" || value === "modified" ? value : "modified";
}

function conflictStatus(value: unknown): DocumentHunkConflictStatus {
  return value === "clean" || value === "conflict" || value === "resolved" ? value : "clean";
}

function mapStoredHunk(value: unknown, index: number): DocumentHunkChange | null {
  if (!isRecord(value)) return null;
  return {
    key: stringField(value, "key", `version-hunk:${index}`),
    index: numberField(value, "index", index),
    status: hunkStatus(value.status),
    before: stringField(value, "before"),
    after: stringField(value, "after"),
    beforeStart: numberField(value, "beforeStart"),
    beforeEnd: numberField(value, "beforeEnd"),
    afterStart: numberField(value, "afterStart"),
    afterEnd: numberField(value, "afterEnd"),
    prefix: stringField(value, "prefix"),
    suffix: stringField(value, "suffix"),
    classification: stringField(value, "classification"),
    conflictStatus: conflictStatus(value.conflictStatus),
  };
}

function mapStoredHunks(value: unknown): DocumentHunkChange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const hunk = mapStoredHunk(item, index);
    return hunk ? [hunk] : [];
  });
}

function mapVersion(row: DocumentVersionRow): DocumentVersion {
  return {
    id: row.id,
    documentId: row.document_id,
    revision: row.revision,
    content: row.content ?? "",
    changeHunks: mapStoredHunks(row.change_hunks),
    actorType: row.actor_type === "agent" ? "agent" : "human",
    authorUserId: row.author_user_id,
    authorAgentLabel: row.author_agent_label,
    summary: row.summary ?? "",
    sourceProposalId: row.source_proposal_id,
    sourceProposalFamilyId: row.source_proposal_family_id ?? null,
    versionFamilyId: row.version_family_id ?? row.source_proposal_family_id ?? null,
    versionFamilyTitle: row.version_family_title ?? "",
    createdAt: row.created_at,
  };
}

type ProposalFamilyRow = {
  id: string;
  family_id: string;
  summary: string | null;
};

async function sourceProposalFamilyMap(
  client: unknown,
  sourceProposalIds: string[]
): Promise<Map<string, { familyId: string; title: string }>> {
  const ids = Array.from(new Set(sourceProposalIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_proposals")
    .select("id, family_id, summary")
    .in("id", ids)) as {
    data: ProposalFamilyRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Could not load source proposal families.");
  }

  return new Map((data ?? []).map((row) => [row.id, { familyId: row.family_id, title: row.summary ?? "" }]));
}

function applySourceProposalFamilies<
  T extends {
    sourceProposalId: string | null;
    sourceProposalFamilyId: string | null;
    versionFamilyId: string | null;
    versionFamilyTitle: string;
  },
>(
  versions: T[],
  familyByProposalId: Map<string, { familyId: string; title: string }>
): T[] {
  return versions.map((version) => ({
    ...version,
    sourceProposalFamilyId: version.sourceProposalId
      ? familyByProposalId.get(version.sourceProposalId)?.familyId ?? version.sourceProposalFamilyId
      : version.sourceProposalFamilyId,
    versionFamilyId: version.sourceProposalId
      ? familyByProposalId.get(version.sourceProposalId)?.familyId ?? version.versionFamilyId
      : version.versionFamilyId,
    versionFamilyTitle: version.sourceProposalId
      ? familyByProposalId.get(version.sourceProposalId)?.title || version.versionFamilyTitle
      : version.versionFamilyTitle,
  }));
}

export async function appendDocumentVersion(
  client: unknown,
  input: {
    documentId: string;
    revision: number;
    content: string;
    actorType: ActorType;
    authorUserId?: string | null;
    authorAgentLabel?: string | null;
    summary?: string;
    sourceProposalId?: string | null;
    versionFamilyId?: string | null;
    versionFamilyTitle?: string | null;
    changeHunks?: DocumentHunkChange[];
  }
): Promise<DocumentVersion> {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_versions")
    .insert({
      document_id: input.documentId,
      revision: input.revision,
      content: input.content,
      actor_type: input.actorType,
      author_user_id: input.authorUserId ?? null,
      author_agent_label: input.authorAgentLabel ?? null,
      summary: input.summary ?? "",
      source_proposal_id: input.sourceProposalId ?? null,
      version_family_id: input.versionFamilyId ?? null,
      version_family_title: input.versionFamilyTitle ?? input.summary ?? "",
      change_hunks: input.changeHunks ?? [],
    })
    .select(VERSION_COLUMNS)
    .single()) as {
    data: DocumentVersionRow | null;
    error: { message: string } | null;
  };

  if (error || !data) {
    throw new Error(error?.message || "Could not record document version.");
  }

  return mapVersion(data);
}

export async function listDocumentVersions(
  client: unknown,
  documentId: string,
  options: { includeContent?: boolean; limit?: number } = {}
): Promise<DocumentVersionSummary[]> {
  const db = client as SupabaseLikeClient;
  const columns = options.includeContent
    ? VERSION_COLUMNS
    : VERSION_COLUMNS.split(", ")
        .filter((column) => column !== "content")
        .join(", ");

  let query = db
    .from("creed_document_versions")
    .select(columns)
    .eq("document_id", documentId)
    .order("revision", { ascending: false });

  if (options.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data, error } = (await query) as {
    data: Array<Partial<DocumentVersionRow> & Omit<DocumentVersionRow, "content">> | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Could not load document versions.");
  }

  const versions = (data ?? []).map((row) => {
    const version = mapVersion({ ...row, content: row.content ?? "" });
    if (options.includeContent) return version;
    const { content: _content, ...summary } = version;
    return summary;
  });
  const familyByProposalId = await sourceProposalFamilyMap(
    client,
    versions.map((version) => version.sourceProposalId).filter((id): id is string => Boolean(id))
  );

  return applySourceProposalFamilies(versions, familyByProposalId);
}

export async function readDocumentVersion(
  client: unknown,
  input: { documentId: string; versionId: string }
): Promise<DocumentVersion | null> {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_versions")
    .select(VERSION_COLUMNS)
    .eq("id", input.versionId)
    .eq("document_id", input.documentId)
    .maybeSingle()) as {
    data: DocumentVersionRow | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Could not load document version.");
  }

  if (!data) return null;

  const version = mapVersion(data);
  if (!version.sourceProposalId) return version;

  const familyByProposalId = await sourceProposalFamilyMap(client, [version.sourceProposalId]);
  return applySourceProposalFamilies([version], familyByProposalId)[0] ?? version;
}

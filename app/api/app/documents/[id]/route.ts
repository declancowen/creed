import { NextResponse } from "next/server";
import { apiResultErrorResponse, requireApiAuth, requireApiJson } from "@/lib/api-auth";
import { documentMetadataPatchFromRecord } from "@/lib/document-properties";
import { recordDocumentActivity } from "@/lib/document-collaboration";
import { routeDocumentEdit } from "@/lib/document-editing";
import { policyForActor } from "@/lib/workspace-settings";
import {
  archiveSharedDocument,
  deleteSharedDocument,
  updateSharedDocumentMetadata,
} from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function statusForCode(code: "invalid" | "not-found" | "conflict" | "forbidden") {
  return code === "forbidden" ? 403 : code === "not-found" ? 404 : code === "conflict" ? 409 : 400;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const json = await requireApiJson(request);
  if (json instanceof NextResponse) return json;

  const { id } = await params;
  const { auth, input } = json;
  const expectedRevision =
    typeof input.expectedRevision === "number" && Number.isInteger(input.expectedRevision)
      ? input.expectedRevision
      : 0;

  // Content edits flow through the workspace policy: rejected (cant-edit),
  // recorded as a pending proposal (propose), or applied + versioned (direct).
  const admin = getSupabaseAdminClient();
  const result = await routeDocumentEdit(admin, {
    documentId: id,
    actorType: "human",
    author: { userId: auth.user.id },
    content: typeof input.content === "string" ? input.content : "",
    expectedRevision,
    summary:
      typeof input.changeTitle === "string" && input.changeTitle.trim()
        ? input.changeTitle.trim()
        : "Updated document content",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: statusForCode(result.code) });
  }

  return NextResponse.json(result);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const json = await requireApiJson(request);
  if (json instanceof NextResponse) return json;

  const { id } = await params;
  const { auth, input } = json;
  const expectedRevision =
    typeof input.expectedRevision === "number" && Number.isInteger(input.expectedRevision)
      ? input.expectedRevision
      : null;

  const admin = getSupabaseAdminClient();

  // Document metadata (status/type/etc.) is not versioned content; it is a
  // lightweight property change gated only by whether humans may edit at all.
  const policy = await policyForActor(admin, "human");
  if (policy === "cant-edit") {
    return NextResponse.json(
      { error: "Editing is turned off for this workspace." },
      { status: 403 }
    );
  }

  const result = await updateSharedDocumentMetadata(admin, {
    id,
    patch: documentMetadataPatchFromRecord(input),
    expectedRevision,
    actorUserId: auth.user.id,
    lastEditedVia: "creed",
  });

  if (!result.ok) {
    return apiResultErrorResponse(result.error, result.code);
  }

  await recordDocumentActivity(admin, {
    documentId: result.value.id,
    actorUserId: auth.user.id,
    action: "document.metadata.updated",
    summary: "Updated document properties",
    metadata: { revision: result.value.revision, source: "creed" },
  });

  return NextResponse.json({ document: result.value });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const admin = getSupabaseAdminClient();
  const permanent = new URL(request.url).searchParams.get("permanent") === "true";

  // Permanent delete: only valid for already-archived documents. Related rows
  // cascade at the database level.
  if (permanent) {
    const result = await deleteSharedDocument(admin, { id });
    if (!result.ok) {
      return apiResultErrorResponse(result.error, result.code);
    }
    return NextResponse.json({ id: result.value.id, deleted: true });
  }

  const result = await archiveSharedDocument(admin, {
    id,
    actorUserId: auth.user.id,
  });

  if (!result.ok) {
    return apiResultErrorResponse(result.error, result.code);
  }

  await recordDocumentActivity(admin, {
    documentId: result.value.id,
    actorUserId: auth.user.id,
    action: "document.archived",
    summary: "Archived document",
    metadata: { source: "creed" },
  });

  return NextResponse.json({ document: result.value });
}

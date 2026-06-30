import { NextResponse } from "next/server";
import { apiResultErrorResponse, requireApiAuth, requireApiJson } from "@/lib/api-auth";
import { documentMetadataPatchFromRecord } from "@/lib/document-properties";
import { recordDocumentActivity } from "@/lib/document-collaboration";
import {
  archiveSharedDocument,
  updateSharedDocumentContent,
  updateSharedDocumentMetadata,
} from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

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

  const admin = getSupabaseAdminClient();
  const result = await updateSharedDocumentContent(admin, {
    id,
    content: typeof input.content === "string" ? input.content : "",
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
    action: "document.content.updated",
    summary: "Updated document content",
    metadata: { revision: result.value.revision, source: "creed" },
  });

  return NextResponse.json({ document: result.value });
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
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const admin = getSupabaseAdminClient();
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

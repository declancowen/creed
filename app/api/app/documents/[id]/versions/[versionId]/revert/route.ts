import { NextResponse } from "next/server";
import { requireApiJson } from "@/lib/api-auth";
import { revertDocumentToVersion } from "@/lib/document-editing";
import { readSharedDocumentById } from "@/lib/shared-documents";
import { recordDocumentActivity } from "@/lib/document-collaboration";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function statusForCode(code: "invalid" | "not-found" | "conflict" | "forbidden") {
  return code === "forbidden" ? 403 : code === "not-found" ? 404 : code === "conflict" ? 409 : 400;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const json = await requireApiJson(request);
  if (json instanceof NextResponse) return json;

  const { id, versionId } = await params;
  const { auth, input } = json;

  const admin = getSupabaseAdminClient();
  const document = await readSharedDocumentById(admin, id);
  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const expectedRevision =
    typeof input.expectedRevision === "number" && Number.isInteger(input.expectedRevision)
      ? input.expectedRevision
      : document.revision;

  const result = await revertDocumentToVersion(admin, {
    documentId: id,
    versionId,
    actorType: "human",
    author: { userId: auth.user.id },
    expectedRevision,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: statusForCode(result.code) });
  }

  if (result.outcome === "applied") {
    await recordDocumentActivity(admin, {
      documentId: id,
      actorUserId: auth.user.id,
      action: "document.reverted",
      summary: "Reverted document to an earlier version",
      metadata: { versionId, revision: result.version.revision },
    });
  }

  return NextResponse.json(result);
}

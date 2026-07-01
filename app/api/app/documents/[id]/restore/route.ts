import { NextResponse } from "next/server";
import { apiResultErrorResponse, requireApiAuth } from "@/lib/api-auth";
import { recordDocumentActivity } from "@/lib/document-collaboration";
import { restoreSharedDocument } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const admin = getSupabaseAdminClient();
  const result = await restoreSharedDocument(admin, {
    id,
    actorUserId: auth.user.id,
  });

  if (!result.ok) {
    return apiResultErrorResponse(result.error, result.code);
  }

  await recordDocumentActivity(admin, {
    documentId: result.value.id,
    actorUserId: auth.user.id,
    action: "document.restored",
    summary: "Restored document",
    metadata: { source: "creed" },
  });

  return NextResponse.json({ document: result.value });
}

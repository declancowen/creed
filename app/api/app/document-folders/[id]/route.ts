import { NextResponse } from "next/server";
import { apiResultErrorResponse, requireApiAuth } from "@/lib/api-auth";
import {
  archiveSharedDocumentFolder,
  deleteSharedDocumentFolder,
} from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const admin = getSupabaseAdminClient();
  const permanent = new URL(request.url).searchParams.get("permanent") === "true";

  if (permanent) {
    const result = await deleteSharedDocumentFolder(admin, { id });
    if (!result.ok) {
      return apiResultErrorResponse(result.error, result.code);
    }
    return NextResponse.json({ id: result.value.id, deleted: true });
  }

  const result = await archiveSharedDocumentFolder(admin, {
    id,
    actorUserId: auth.user.id,
  });

  if (!result.ok) {
    return apiResultErrorResponse(result.error, result.code);
  }

  return NextResponse.json({ folder: result.value });
}

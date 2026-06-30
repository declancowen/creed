import { NextResponse } from "next/server";
import { apiResultErrorResponse, requireApiAuth } from "@/lib/api-auth";
import { archiveSharedDocumentFolder } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const result = await archiveSharedDocumentFolder(getSupabaseAdminClient(), {
    id,
    actorUserId: auth.user.id,
  });

  if (!result.ok) {
    return apiResultErrorResponse(result.error, result.code);
  }

  return NextResponse.json({ folder: result.value });
}

import { NextResponse } from "next/server";
import { apiResultErrorResponse, requireApiAuth } from "@/lib/api-auth";
import { rejectDocumentComment } from "@/lib/document-collaboration";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

// Reject a pending agent-proposed comment. Only the proposer (the comment's
// created_by) may reject; rejection hard-deletes the comment and its replies and
// leaves no activity trace.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { commentId } = await params;
  const admin = getSupabaseAdminClient();
  const result = await rejectDocumentComment(admin, {
    commentId,
    actorUserId: auth.user.id,
  });

  if (!result.ok) {
    return apiResultErrorResponse(result.error, result.code);
  }

  return NextResponse.json({ id: result.value.id, parentId: result.value.parentId });
}

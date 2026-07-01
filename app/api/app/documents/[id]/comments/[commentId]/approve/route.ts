import { NextResponse } from "next/server";
import { apiResultErrorResponse, requireApiAuth } from "@/lib/api-auth";
import {
  approveDocumentComment,
  deliverPendingMentionEmails,
} from "@/lib/document-collaboration";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

// Approve a pending agent-proposed comment. Only the proposer (the comment's
// created_by) may approve; approval publishes it as their own shared comment and
// fires the deferred mention notifications + emails + workspace activity.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { commentId } = await params;
  const admin = getSupabaseAdminClient();
  const result = await approveDocumentComment(admin, {
    commentId,
    actorUserId: auth.user.id,
  });

  if (!result.ok) {
    return apiResultErrorResponse(result.error, result.code);
  }

  await deliverPendingMentionEmails(admin, result.value.pendingEmails);
  return NextResponse.json({ comment: result.value.comment });
}

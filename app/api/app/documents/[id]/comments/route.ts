import { NextResponse } from "next/server";
import { apiResultErrorResponse, requireApiAuth, requireApiJson } from "@/lib/api-auth";
import {
  createDocumentComment,
  deliverPendingMentionEmails,
  listDocumentComments,
} from "@/lib/document-collaboration";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const comments = await listDocumentComments(getSupabaseAdminClient(), id);
  return NextResponse.json({ comments });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const json = await requireApiJson(request);
  if (json instanceof NextResponse) return json;

  const { id } = await params;
  const { auth, input } = json;
  const mentionedUserIds = Array.isArray(input.mentionedUserIds)
    ? input.mentionedUserIds.filter((value): value is string => typeof value === "string")
    : undefined;

  const admin = getSupabaseAdminClient();
  const result = await createDocumentComment(admin, {
    documentId: id,
    body: typeof input.body === "string" ? input.body : "",
    parentId: typeof input.parentId === "string" ? input.parentId : null,
    referenceId: typeof input.referenceId === "string" ? input.referenceId : null,
    referenceQuote: typeof input.referenceQuote === "string" ? input.referenceQuote : null,
    mentionedUserIds,
    actorUserId: auth.user.id,
    source: "creed",
  });

  if (!result.ok) {
    return apiResultErrorResponse(result.error, result.code);
  }

  await deliverPendingMentionEmails(admin, result.value.pendingEmails);
  return NextResponse.json({
    comment: result.value.comment,
    notifications: result.value.notifications,
  });
}

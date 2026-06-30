import { NextResponse } from "next/server";
import { apiResultErrorResponse, requireApiJson } from "@/lib/api-auth";
import { setDocumentCommentStatus } from "@/lib/document-collaboration";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const json = await requireApiJson(request);
  if (json instanceof NextResponse) return json;

  const { id } = await params;
  const { auth, input } = json;
  const status = input.status === "resolved" ? "resolved" : input.status === "open" ? "open" : null;
  if (!status) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const result = await setDocumentCommentStatus(getSupabaseAdminClient(), {
    commentId: id,
    status,
    actorUserId: auth.user.id,
  });

  if (!result.ok) {
    return apiResultErrorResponse(result.error, result.code);
  }

  return NextResponse.json({ comment: result.value });
}

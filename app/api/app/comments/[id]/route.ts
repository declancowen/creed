import { NextResponse } from "next/server";
import { apiResultErrorResponse, requireApiAuth, requireApiJson } from "@/lib/api-auth";
import {
  deleteDocumentComment,
  setDocumentCommentStatus,
  updateDocumentComment,
} from "@/lib/document-collaboration";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const json = await requireApiJson(request);
  if (json instanceof NextResponse) return json;

  const { id } = await params;
  const { auth, input } = json;

  // A PATCH can either edit the body text or flip the open/resolved status.
  // Body edits take precedence when a body string is present.
  if (typeof input.body === "string") {
    const result = await updateDocumentComment(getSupabaseAdminClient(), {
      commentId: id,
      body: input.body,
      actorUserId: auth.user.id,
    });

    if (!result.ok) {
      return apiResultErrorResponse(result.error, result.code);
    }

    return NextResponse.json({ comment: result.value });
  }

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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const result = await deleteDocumentComment(getSupabaseAdminClient(), {
    commentId: id,
    actorUserId: auth.user.id,
  });

  if (!result.ok) {
    return apiResultErrorResponse(result.error, result.code);
  }

  return NextResponse.json({ deleted: result.value });
}

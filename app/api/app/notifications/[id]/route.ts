import { NextResponse } from "next/server";
import { apiResultErrorResponse, requireApiJson } from "@/lib/api-auth";
import { markNotificationRead } from "@/lib/document-collaboration";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const json = await requireApiJson(request);
  if (json instanceof NextResponse) return json;

  const { id } = await params;
  const { auth, input } = json;
  const result = await markNotificationRead(getSupabaseAdminClient(), {
    notificationId: id,
    userId: auth.user.id,
    read: input.read !== false,
  });

  if (!result.ok) {
    return apiResultErrorResponse(result.error, result.code);
  }

  return NextResponse.json({ notification: result.value });
}

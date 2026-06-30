import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { listNotifications } from "@/lib/document-collaboration";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const notifications = await listNotifications(getSupabaseAdminClient(), auth.user.id);
  return NextResponse.json({ notifications });
}

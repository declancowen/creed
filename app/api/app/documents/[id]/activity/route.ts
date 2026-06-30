import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { listDocumentActivity } from "@/lib/document-collaboration";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const activity = await listDocumentActivity(getSupabaseAdminClient(), id);
  return NextResponse.json({ activity });
}

import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { listDocumentVersions } from "@/lib/document-versions";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const admin = getSupabaseAdminClient();
  const versions = await listDocumentVersions(admin, id);
  return NextResponse.json({ versions });
}

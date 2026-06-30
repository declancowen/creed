import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { listWorkspaceUsers } from "@/lib/document-collaboration";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const users = await listWorkspaceUsers(getSupabaseAdminClient());
  return NextResponse.json({ users });
}

import { NextResponse } from "next/server";
import { apiResultErrorResponse, requireApiAuth, requireApiJson } from "@/lib/api-auth";
import {
  createSharedDocumentFolder,
  listSharedDocumentFolders,
} from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const folders = await listSharedDocumentFolders(auth.supabase);
  return NextResponse.json({ folders });
}

export async function POST(request: Request) {
  const json = await requireApiJson(request);
  if (json instanceof NextResponse) return json;

  const { auth, input } = json;
  const admin = getSupabaseAdminClient();
  const result = await createSharedDocumentFolder(admin, {
    name: typeof input.name === "string" ? input.name : "",
    parentFolderId: typeof input.parentFolderId === "string" ? input.parentFolderId : null,
    actorUserId: auth.user.id,
  });

  if (!result.ok) {
    return apiResultErrorResponse(result.error, result.code);
  }

  return NextResponse.json({ folder: result.value });
}

import { NextResponse } from "next/server";
import { apiResultErrorResponse, requireApiAuth, requireApiJson } from "@/lib/api-auth";
import {
  createSharedDocumentFolder,
  listArchivedSharedDocumentFolders,
  listSharedDocumentFolders,
} from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const archived = new URL(request.url).searchParams.get("archived") === "true";
  const folders = archived
    ? await listArchivedSharedDocumentFolders(auth.supabase)
    : await listSharedDocumentFolders(auth.supabase);
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

import { NextResponse } from "next/server";
import { apiResultErrorResponse, requireApiAuth, requireApiJson } from "@/lib/api-auth";
import { documentMetadataPatchFromRecord } from "@/lib/document-properties";
import { recordDocumentActivity } from "@/lib/document-collaboration";
import { createSharedDocument, listSharedDocuments } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const documents = await listSharedDocuments(auth.supabase);
  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  const json = await requireApiJson(request);
  if (json instanceof NextResponse) return json;

  const { auth, input } = json;
  const admin = getSupabaseAdminClient();
  const metadata = documentMetadataPatchFromRecord(input);
  const result = await createSharedDocument(admin, {
    title: typeof input.title === "string" ? input.title : "",
    description: typeof input.description === "string" ? input.description : "",
    content: typeof input.content === "string" ? input.content : undefined,
    folderId: typeof input.folderId === "string" ? input.folderId : null,
    actorUserId: auth.user.id,
    githubRepoOwner: typeof input.githubRepoOwner === "string" ? input.githubRepoOwner : null,
    githubRepoName: typeof input.githubRepoName === "string" ? input.githubRepoName : null,
    githubBranch: typeof input.githubBranch === "string" ? input.githubBranch : null,
    githubPath: typeof input.githubPath === "string" ? input.githubPath : null,
    documentType: metadata.documentType,
    stage: metadata.stage,
    lifecycle: metadata.lifecycle,
    status: metadata.status,
    priority: metadata.priority,
    size: metadata.size,
    lastEditedVia: "creed",
  });

  if (!result.ok) {
    return apiResultErrorResponse(result.error, result.code);
  }

  await recordDocumentActivity(admin, {
    documentId: result.value.id,
    actorUserId: auth.user.id,
    action: "document.created",
    summary: "Created document",
    metadata: { source: "creed" },
  });

  return NextResponse.json({ document: result.value });
}

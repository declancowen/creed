import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { acceptDocumentProposal } from "@/lib/document-editing";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function statusForCode(code: "invalid" | "not-found" | "conflict" | "forbidden") {
  return code === "forbidden" ? 403 : code === "not-found" ? 404 : code === "conflict" ? 409 : 400;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { id, proposalId } = await params;
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const allowStaleSectionUpdate =
    body !== null &&
    typeof body === "object" &&
    (body as { allowStaleSectionUpdate?: unknown }).allowStaleSectionUpdate === true;

  const admin = getSupabaseAdminClient();
  const result = await acceptDocumentProposal(admin, {
    documentId: id,
    proposalId,
    actorUserId: auth.user.id,
    allowStaleSectionUpdate,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: statusForCode(result.code) });
  }

  return NextResponse.json({ document: result.value.document, version: result.value.version });
}

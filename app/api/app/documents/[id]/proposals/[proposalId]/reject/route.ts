import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { rejectDocumentProposal } from "@/lib/document-editing";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function statusForCode(code: "invalid" | "not-found" | "conflict" | "forbidden") {
  return code === "forbidden" ? 403 : code === "not-found" ? 404 : code === "conflict" ? 409 : 400;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { id, proposalId } = await params;
  const admin = getSupabaseAdminClient();
  const result = await rejectDocumentProposal(admin, {
    documentId: id,
    proposalId,
    actorUserId: auth.user.id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: statusForCode(result.code) });
  }

  return NextResponse.json({ proposal: result.value });
}

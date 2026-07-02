import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { recordDocumentActivity } from "@/lib/document-collaboration";
import { ensurePublicDocumentShare } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function statusForCode(code: "invalid" | "not-found" | "conflict") {
  return code === "not-found" ? 404 : code === "conflict" ? 409 : 400;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const admin = getSupabaseAdminClient();
  const result = await ensurePublicDocumentShare(admin, {
    id,
    actorUserId: auth.user.id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: statusForCode(result.code) });
  }

  if (!result.value.publicShareId) {
    return NextResponse.json({ error: "Public link was not created." }, { status: 500 });
  }

  await recordDocumentActivity(admin, {
    documentId: result.value.id,
    actorUserId: auth.user.id,
    action: "document.public_link.created",
    summary: "Created public document link",
    metadata: { source: "creed" },
  });

  const url = new URL(`/share/${encodeURIComponent(result.value.publicShareId)}`, request.url);
  return NextResponse.json({ document: result.value, url: url.toString() });
}

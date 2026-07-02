import { NextResponse } from "next/server";
import {
  createDocumentComment,
  listDocumentActivity,
} from "@/lib/document-collaboration";
import { checkRateLimit } from "@/lib/rate-limit";
import { readPublicSharedDocument } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type PublicCommentRequest = {
  name?: unknown;
  body?: unknown;
  parentId?: unknown;
};

function statusForCode(code: "invalid" | "not-found" | "conflict" | "forbidden") {
  if (code === "not-found") return 404;
  if (code === "conflict") return 409;
  if (code === "forbidden") return 403;
  return 400;
}

function callerIdentifier(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params;
  const decodedShareId = decodeURIComponent(shareId);
  const verdict = checkRateLimit({
    scope: "public-document-comment",
    identifier: `${decodedShareId}:${callerIdentifier(request)}`,
    limit: 12,
    windowMs: 60_000,
  });

  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many comments. Try again in a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(verdict.retryAfterSeconds) },
      }
    );
  }

  let input: PublicCommentRequest;
  try {
    input = (await request.json()) as PublicCommentRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof input.name === "string" ? input.name : "";
  const body = typeof input.body === "string" ? input.body : "";
  const parentId = typeof input.parentId === "string" ? input.parentId : null;
  const admin = getSupabaseAdminClient();
  const document = await readPublicSharedDocument(admin, decodedShareId);

  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const result = await createDocumentComment(admin, {
    documentId: document.id,
    body,
    parentId,
    source: "public",
    publicAuthorLabel: name,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: statusForCode(result.code) }
    );
  }

  const activity = await listDocumentActivity(admin, document.id);
  return NextResponse.json({ comment: result.value.comment, activity });
}

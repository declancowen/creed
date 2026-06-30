import { notFound } from "next/navigation";
import { FileScreen } from "@/components/creed/file-screen";
import {
  listDocumentActivity,
  listDocumentComments,
  listWorkspaceUsers,
} from "@/lib/document-collaboration";
import { readSharedDocument } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function FilePage({
  searchParams,
}: {
  searchParams: Promise<{ document?: string; comment?: string }>;
}) {
  const params = await searchParams;
  const documentSlug = params.document?.trim();

  if (!documentSlug) {
    return <FileScreen />;
  }

  const supabase = await createSupabaseServerClient();
  const document = await readSharedDocument(supabase, decodeURIComponent(documentSlug));

  if (!document) {
    notFound();
  }

  const admin = getSupabaseAdminClient();
  const [comments, activity, users] = await Promise.all([
    listDocumentComments(admin, document.id),
    listDocumentActivity(admin, document.id),
    listWorkspaceUsers(admin),
  ]);

  return (
    <FileScreen
      sharedDocument={{
        document,
        comments,
        activity,
        users,
        activeCommentId: params.comment ?? null,
      }}
    />
  );
}

import { notFound } from "next/navigation";
import { FileScreen } from "@/components/creed/file-screen";
import {
  listDocumentActivity,
  listDocumentComments,
  listPendingCommentsForUser,
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = getSupabaseAdminClient();
  const [comments, activity, users, pendingComments] = await Promise.all([
    listDocumentComments(admin, document.id),
    listDocumentActivity(admin, document.id),
    listWorkspaceUsers(admin),
    // Pending agent-proposed comments are private to their proposer; only ever
    // fetched scoped to the signed-in viewer.
    user?.id
      ? listPendingCommentsForUser(admin, document.id, user.id)
      : Promise.resolve([]),
  ]);

  return (
    <FileScreen
      sharedDocument={{
        document,
        comments,
        pendingComments,
        activity,
        users,
        currentUserId: user?.id ?? null,
        activeCommentId: params.comment ?? null,
      }}
    />
  );
}

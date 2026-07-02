import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PublicDocumentScreen } from "@/components/creed/public-document-screen";
import {
  listDocumentActivity,
  listDocumentComments,
} from "@/lib/document-collaboration";
import { readPublicSharedDocument } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PublicDocumentPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const admin = getSupabaseAdminClient();
  const document = await readPublicSharedDocument(admin, decodeURIComponent(shareId));

  if (!document) {
    notFound();
  }

  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect(`/file?document=${encodeURIComponent(document.slug)}`);
    }
  }

  const [comments, activity] = await Promise.all([
    listDocumentComments(admin, document.id),
    listDocumentActivity(admin, document.id),
  ]);

  return (
    <PublicDocumentScreen
      shareId={shareId}
      document={document}
      initialComments={comments}
      initialActivity={activity}
    />
  );
}

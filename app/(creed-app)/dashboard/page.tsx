import { redirect } from "next/navigation";
import { DocumentsDashboardScreen } from "@/components/creed/documents-dashboard-screen";
import {
  listSharedDocumentFolders,
  listSharedDocuments,
  readDocumentDashboardPreferences,
} from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  const admin = getSupabaseAdminClient();
  const [documents, folders, preferences] = await Promise.all([
    listSharedDocuments(supabase),
    listSharedDocumentFolders(supabase),
    readDocumentDashboardPreferences(admin, user.id),
  ]);

  return <DocumentsDashboardScreen documents={documents} folders={folders} preferences={preferences.effective} />;
}

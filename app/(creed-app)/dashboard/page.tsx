import { redirect } from "next/navigation";
import { DocumentsDashboardScreen } from "@/components/creed/documents-dashboard-screen";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadDashboardData } from "./dashboard-data";

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
  const data = await loadDashboardData(supabase, admin, user.id);

  if ("notFound" in data) {
    redirect("/dashboard");
  }

  return (
    <DocumentsDashboardScreen
      key={data.currentFolder?.id ?? "root"}
      documents={data.documents}
      folders={data.folders}
      allFolders={data.allFolders}
      currentFolder={data.currentFolder}
      breadcrumbs={data.breadcrumbs}
      preferences={data.preferences}
    />
  );
}

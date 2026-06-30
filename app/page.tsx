import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { log } from "@/lib/observability";

// Root-page router. Signed-out visitors see login; signed-in users go straight
// into the app. Public signup/onboarding is not part of the invite-only auth flow.
export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    log.error("home_supabase_client_init_failed", { route: "/" }, error);
    throw error;
  }

  let user;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    log.error("home_get_user_failed", { route: "/" }, error);
    throw error;
  }

  if (!user) {
    redirect("/login");
  }

  redirect("/dashboard");
}

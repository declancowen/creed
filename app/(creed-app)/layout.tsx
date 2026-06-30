import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShellLayout } from "@/components/creed/app-shell-layout";
import { AuthedProviders } from "@/components/creed/authed-providers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Signed-in product gate for /dashboard, /file, /connections, and /settings. Invite-only
// auth owns access now; the old public onboarding/payment gate must not catch
// users after login.
export const dynamic = "force-dynamic";

export default async function CreedAppLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) {
    // Local dev without Supabase config: skip the gate so the rest of
    // the app can render. Production deployments always have Supabase.
    return (
      <AuthedProviders>
        <AppShellLayout>{children}</AppShellLayout>
      </AuthedProviders>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  return (
    <AuthedProviders>
      <AppShellLayout>{children}</AppShellLayout>
    </AuthedProviders>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AcceptInviteScreen } from "@/components/auth/accept-invite-screen";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Finish sign-in | Creed",
  description: "Finish setting up your Creed sign-in.",
};

export default async function AcceptInvitePage() {
  if (!isSupabaseConfigured()) {
    return <AcceptInviteScreen configured={false} />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/accept-invite");
  }

  return <AcceptInviteScreen configured userEmail={user.email ?? undefined} />;
}

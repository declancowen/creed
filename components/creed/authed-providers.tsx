import type { ReactNode } from "react";
import { BackendSetupScreen } from "@/components/auth/backend-setup-screen";
import { CreedProvider } from "@/components/creed/creed-provider";
import { initialCreedState } from "@/lib/creed-data";
import { loadCreedState, persistCreedState } from "@/lib/creed-backend";
import { isSupabaseTableMissingError } from "@/lib/creed-backend-errors";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Loads the signed-in user's Creed and wraps its subtree in <CreedProvider>.
// This is the dynamic, user-specific boundary that used to live in the root
// layout. Keeping it out of the root prevents public and auth routes from
// reading signed-in user state while the app shell still gets live data.
export async function AuthedProviders({ children }: { children: ReactNode }) {
  let initialState = initialCreedState;
  let persistenceEnabled = false;
  let missingSchemaMessage: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      try {
        const result = await loadCreedState(supabase, user);

        if (result.hasPersistedCreed) {
          initialState = result.state;
          persistenceEnabled = true;
        } else {
          const starterState = {
            ...result.state,
            sections: initialCreedState.sections.map((section) => ({ ...section })),
            proposals: [],
            activity: [],
            sectionRevisions: Object.fromEntries(
              initialCreedState.sections.map((section) => [section.id, 1])
            ),
          };

          await persistCreedState(supabase, user.id, starterState);
          initialState = starterState;
          persistenceEnabled = true;
        }
      } catch (error) {
        if (isSupabaseTableMissingError(error)) {
          missingSchemaMessage =
            error instanceof Error ? error.message : "Creed tables are missing.";
        } else {
          throw error;
        }
      }
    }
  }

  if (missingSchemaMessage) {
    return <BackendSetupScreen errorMessage={missingSchemaMessage} />;
  }

  return (
    <CreedProvider initialState={initialState} persistenceEnabled={persistenceEnabled}>
      {children}
    </CreedProvider>
  );
}

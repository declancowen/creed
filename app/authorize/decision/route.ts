import { NextResponse } from "next/server";
import {
  DEFAULT_SCOPE,
  DIRECT_EDIT_SCOPE,
  getOAuthClient,
  isAllowedRedirectUri,
  issueAuthorizationCode,
} from "@/lib/oauth";
import { hasPersistedCreed } from "@/lib/creed-backend";
import { hasPaidEntitlement } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Handles the Allow / Deny POST from the consent screen. The user is
// re-resolved from the session (never a form field) and the client + redirect
// are re-validated here before any code is issued.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string) {
  return new NextResponse(message, { status: 400 });
}

function redirectWith(redirectUri: string, params: Record<string, string>) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url.toString());
}

export async function POST(request: Request) {
  const form = await request.formData();
  const decision = String(form.get("decision") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const state = form.get("state");
  // Bound the reflected state defensively; legitimate CSRF state is short.
  const stateValue = typeof state === "string" && state.length <= 2048 ? state : "";

  if (!clientId || !redirectUri || !codeChallenge) {
    return badRequest("Missing required parameters.");
  }

  // Re-validate the client and redirect server-side. Hidden form fields are
  // attacker-controllable, so we never trust them without re-checking.
  const client = await getOAuthClient(clientId);
  if (!client || !isAllowedRedirectUri(redirectUri, client.redirectUris)) {
    return badRequest("Invalid client or redirect URI.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Session expired between render and submit. Send them home to sign in
    // again rather than leaking anything to the redirect URI.
    return NextResponse.redirect(new URL("/", request.url).toString());
  }

  if (decision !== "allow") {
    return redirectWith(redirectUri, {
      error: "access_denied",
      ...(stateValue ? { state: stateValue } : {}),
    });
  }

  // Eligibility is re-checked at grant time: MCP is a paid feature and needs a
  // real Creed to read.
  const paid = await hasPaidEntitlement(supabase, user.id);
  const hasCreed = paid && (await hasPersistedCreed(supabase, user.id));
  if (!paid || !hasCreed) {
    return badRequest("This account is not set up to connect agents yet.");
  }

  // Single grant: scope is decided here, not requested by the client. Direct
  // edit is only granted when the user has approval turned off.
  const { data: tokenRow } = await supabase
    .from("creed_tokens")
    .select("require_approval")
    .eq("user_id", user.id)
    .maybeSingle();
  const requireApproval = tokenRow?.require_approval ?? true;
  const scope = requireApproval
    ? DEFAULT_SCOPE
    : `${DEFAULT_SCOPE} ${DIRECT_EDIT_SCOPE}`;

  const code = await issueAuthorizationCode({
    clientId,
    userId: user.id,
    redirectUri,
    codeChallenge,
    scope,
  });

  return redirectWith(redirectUri, {
    code,
    ...(stateValue ? { state: stateValue } : {}),
  });
}

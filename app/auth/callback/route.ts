import { NextResponse } from "next/server";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { upsertGitHubIntegration } from "@/lib/creed-backend";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "invite",
  "recovery",
  "email_change",
  "email",
]);

function normalizeEmailOtpType(value: string | null): EmailOtpType | null {
  if (value === "magiclink" || value === "signup") {
    return "email";
  }
  return value !== null && EMAIL_OTP_TYPES.has(value as EmailOtpType)
    ? (value as EmailOtpType)
    : null;
}

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function userIdentities(user: User) {
  return (
    (user.identities as
      | Array<{
          provider?: string;
          id?: string;
          identity_data?: Record<string, unknown> | null;
        }>
      | undefined) ?? []
  );
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") || "/accept-invite";
  const integration = searchParams.get("integration");
  const expectedEmail = normalizeEmail(searchParams.get("expected_email"));

  // Identity-link flows (reconnect GitHub, connect Google/X in Settings) come
  // back through here with the user already signed in. We must not treat them
  // like a fresh login or bounce them to /login on any hiccup.
  const isLinkFlow = integration !== null || next.startsWith("/settings");

  let exchangeFailed = false;
  if (code || tokenHash) {
    const supabase = await createSupabaseServerClient();
    const emailOtpType = normalizeEmailOtpType(type);

    const { data, error } =
      tokenHash && emailOtpType
        ? await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: emailOtpType,
          })
        : code
          ? await supabase.auth.exchangeCodeForSession(code)
          : {
              data: { session: null, user: null },
              error: new Error("Invalid email link."),
            };

    const session = data.session;
    const user = data.user ?? session?.user;

    // Only a real error means the link was invalid / expired (or opened in a
    // browser that never held the PKCE verifier). A merely-absent session is
    // normal for identity linking, so don't treat that as a failure.
    if (error) {
      exchangeFailed = true;
    }

    if (user && !isLinkFlow) {
      const identities = userIdentities(user);
      const hasGoogleIdentity = identities.some((identity) => identity.provider === "google");
      const hasEmailIdentity = identities.some((identity) => identity.provider === "email");

      if (hasGoogleIdentity && !hasEmailIdentity) {
        await supabase.auth.signOut();
        const redirectUrl = new URL("/login", origin);
        redirectUrl.searchParams.set("next", "/accept-invite");
        redirectUrl.searchParams.set("error", "invite_required");
        return NextResponse.redirect(redirectUrl);
      }
    }

    if (
      expectedEmail &&
      user &&
      normalizeEmail(user.email) !== expectedEmail
    ) {
      await supabase.auth.signOut();
      const mismatchNext = next.startsWith("/settings") ? "/settings" : "/accept-invite";
      const redirectUrl = new URL("/login", origin);
      redirectUrl.searchParams.set("next", mismatchNext);
      redirectUrl.searchParams.set("error", "oauth_email_mismatch");
      return NextResponse.redirect(redirectUrl);
    }

    if (integration === "github" && session?.provider_token && user) {
      const githubIdentity = userIdentities(user).find((identity) => identity.provider === "github");

      await upsertGitHubIntegration(supabase, user.id, {
        status: "connected",
        providerAccountId: githubIdentity?.id ?? null,
        providerLogin:
          (typeof githubIdentity?.identity_data?.user_name === "string"
            ? githubIdentity.identity_data.user_name
            : null) ??
          (typeof githubIdentity?.identity_data?.preferred_username === "string"
            ? githubIdentity.identity_data.preferred_username
            : null),
        accessToken: session.provider_token,
        refreshToken: session.provider_refresh_token ?? null,
        tokenExpiresAt: null,
      });
    }
  }

  // Resolve `next` strictly against our origin and reject anything that
  // could resolve to a different host. This blocks open-redirect tricks
  // like `next=//evil.com` or `next=/\evil.com` (which `startsWith("/")`
  // alone would have accepted).
  const safeNext = (() => {
    if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
      return "/";
    }
    try {
      const resolved = new URL(next, origin);
      return resolved.origin === origin ? `${resolved.pathname}${resolved.search}${resolved.hash}` : "/";
    } catch {
      return "/";
    }
  })();

  // Only a genuinely failed sign-in/confirmation goes to /login; link flows
  // always return to where they came from (the user is still signed in).
  const attemptedExchange = Boolean(code || tokenHash);
  const target = attemptedExchange && exchangeFailed && !isLinkFlow ? "/login" : safeNext;
  return NextResponse.redirect(`${origin}${target}`);
}

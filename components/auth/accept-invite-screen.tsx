"use client";

// Post-invite setup. The invite or magic-link callback has already created a
// Supabase session, so actions here are scoped to that invited user.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { UserIdentity } from "@supabase/supabase-js";
import { CheckCircle2, LoaderCircle } from "@/components/ui/phosphor-icons";
import { toast } from "sonner";
import { AnimatedPageTitle } from "@/components/marketing/animated-page-title";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthSubmitButton, PasswordField } from "@/components/auth/auth-fields";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type GoogleState = "loading" | "connected" | "not-connected" | "email-mismatch";
const APP_ENTRY_PATH = "/dashboard";

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function identityEmail(identity: UserIdentity | null) {
  const data = (identity?.identity_data ?? {}) as Record<string, unknown>;
  const value = data.email;
  return typeof value === "string" ? value : undefined;
}

export function AcceptInviteScreen({
  configured = true,
  userEmail,
}: {
  configured?: boolean;
  userEmail?: string;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [savingPassword, setSavingPassword] = useState(false);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [googleState, setGoogleState] = useState<GoogleState>("loading");
  const [effectiveEmail, setEffectiveEmail] = useState(userEmail);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!configured) {
      setGoogleState("not-connected");
      return;
    }

    let active = true;
    const supabase = getSupabaseBrowserClient();

    async function loadIdentityState() {
      const [{ data: userData }, { data: identityData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getUserIdentities(),
      ]);
      if (!active) return;

      const email = userData.user?.email ?? userEmail;
      setEffectiveEmail(email);

      const identities = (identityData.identities ?? []) as UserIdentity[];
      const googleIdentity =
        identities.find((identity) => identity.provider === "google") ?? null;
      if (!googleIdentity) {
        setGoogleState("not-connected");
        return;
      }

      const invitedEmail = normalizeEmail(email);
      const googleEmail = normalizeEmail(identityEmail(googleIdentity));
      if (invitedEmail && googleEmail && invitedEmail !== googleEmail) {
        await supabase.auth.unlinkIdentity(googleIdentity);
        if (!active) return;
        setGoogleState("email-mismatch");
        toast.error("Google account email must match your invite email.");
        return;
      }

      setGoogleState("connected");
    }

    void loadIdentityState();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadIdentityState();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [configured, userEmail]);

  useEffect(() => {
    if (googleState === "connected") {
      window.location.assign(APP_ENTRY_PATH);
    }
  }, [googleState]);

  async function handlePasswordSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (savingPassword || !configured) return;

    setPasswordError(undefined);
    setConfirmError(undefined);

    if (password.length < 8) {
      setPasswordError("Use at least 8 characters.");
      passwordRef.current?.focus();
      return;
    }
    if (confirm !== password) {
      setConfirmError("Passwords do not match.");
      return;
    }

    setSavingPassword(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setConfirm("");
      toast.success("Password saved");
      window.location.assign(APP_ENTRY_PATH);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save password.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleGoogleLink() {
    if (linkingGoogle || !configured) return;
    setLinkingGoogle(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", "/accept-invite");
      if (effectiveEmail) {
        callbackUrl.searchParams.set("expected_email", effectiveEmail);
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });
      if (error) throw error;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not connect Google.";
      toast.error(message);
      setLinkingGoogle(false);
    }
  }

  const googleLabel =
    googleState === "connected"
      ? "Google connected"
      : googleState === "email-mismatch"
        ? "Google email does not match"
        : "Connect Google";

  return (
    <AuthShell>
      <AnimatedPageTitle
        text="Finish sign-in"
        className="text-[30px] font-medium leading-tight tracking-[-0.02em] md:text-[34px]"
      />
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--creed-text-secondary)]">
        Your invite is tied to{" "}
        <span className="font-medium text-[var(--creed-text-primary)]">
          {effectiveEmail ?? "this email"}
        </span>
        . Add a password or connect the matching Google account.
      </p>

      <div className="mt-8 rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-surface)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-medium text-[var(--creed-text-primary)]">
              Google
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-[var(--creed-text-secondary)]">
              Use the Google account with the same email as your invite.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleGoogleLink()}
            disabled={linkingGoogle || googleState === "loading" || googleState === "connected" || !configured}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[var(--creed-text-primary)] px-4 text-[14px] font-medium text-[var(--creed-button-primary-fg)] transition-colors hover:bg-[var(--creed-button-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {googleState === "loading" || linkingGoogle ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : googleState === "connected" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : null}
            {googleLabel}
          </button>
        </div>
        {googleState === "email-mismatch" ? (
          <p className="mt-3 text-[13px] leading-5 text-[#DC2626]">
            Disconnect this Google account in Settings and connect the account that matches your invite email.
          </p>
        ) : null}
      </div>

      <form onSubmit={handlePasswordSubmit} noValidate className="mt-5 flex flex-col gap-3">
        <PasswordField
          inputRef={passwordRef}
          label="Password"
          autoComplete="new-password"
          value={password}
          disabled={savingPassword || !configured}
          error={passwordError}
          onChange={(value) => {
            setPassword(value);
            if (passwordError) setPasswordError(undefined);
          }}
        />
        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          value={confirm}
          disabled={savingPassword || !configured}
          error={confirmError}
          onChange={(value) => {
            setConfirm(value);
            if (confirmError) setConfirmError(undefined);
          }}
        />
        <AuthSubmitButton
          label="Save password"
          loading={savingPassword}
          disabled={savingPassword || !configured}
        />
      </form>

      <Link
        href="/"
        className="mt-6 inline-flex w-full justify-center text-[14px] font-medium text-[var(--creed-text-primary)] transition-colors hover:text-[#2563EB]"
      >
        Continue to Creed
      </Link>
    </AuthShell>
  );
}

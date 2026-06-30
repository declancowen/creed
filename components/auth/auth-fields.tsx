"use client";

// Shared form primitives for the auth surface (/login,
// /reset-password): the text field, the password field with the eye
// toggle, the checkbox, and the submit button. Kept
// here so every auth screen stays visually and behaviourally identical.

import { useState, type ReactNode, type Ref } from "react";
import { ArrowRight, Check, Eye, EyeOff, LoaderCircle } from "@/components/ui/phosphor-icons";
import { cn } from "@/lib/utils";

type AuthFieldProps = {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  disabled?: boolean;
  error?: string;
  trailing?: ReactNode;
  ref?: Ref<HTMLInputElement>;
};

export function AuthField({
  ref,
  label,
  type,
  value,
  onChange,
  autoComplete,
  disabled,
  error,
  trailing,
}: AuthFieldProps) {
  return (
    <div>
      <div className="relative">
        <input
          ref={ref}
          type={type}
          placeholder={label}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          autoComplete={autoComplete}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "h-12 w-full rounded-[var(--radius-md)] border bg-[var(--creed-surface)] px-4 text-[15px] text-[var(--creed-text-primary)] outline-none transition-colors placeholder:text-[var(--creed-text-tertiary)] focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60",
            trailing ? "pr-12" : "",
            error
              ? "border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]/15"
              : "border-[var(--creed-border)] focus:border-[#2563EB] focus:ring-[#2563EB]/15"
          )}
        />
        {trailing ? (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>
        ) : null}
      </div>
      {error ? <p className="mt-1.5 text-[13px] text-[#DC2626]">{error}</p> : null}
    </div>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  error,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  disabled?: boolean;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [show, setShow] = useState(false);

  return (
    <AuthField
      ref={inputRef}
      type={show ? "text" : "password"}
      label={label}
      autoComplete={autoComplete}
      value={value}
      onChange={onChange}
      disabled={disabled}
      error={error}
      trailing={
        <button
          type="button"
          tabIndex={-1}
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--creed-text-tertiary)] transition-colors hover:text-[#2563EB]"
        >
          {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
        </button>
      }
    />
  );
}

export function AuthCheckbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        checked
          ? "border-[#2563EB] bg-[#2563EB] text-white"
          : "border-[var(--creed-border-strong)] bg-[var(--creed-surface)] hover:border-[var(--creed-text-tertiary)]"
      )}
    >
      {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
    </button>
  );
}

export function AuthSubmitButton({
  label,
  loading,
  disabled,
}: {
  label: string;
  loading: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[#2563EB] text-[15px] font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
      {loading ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <ArrowRight className="inline-flex h-4 w-4 shrink-0 items-center justify-center leading-none" />
      )}
    </button>
  );
}

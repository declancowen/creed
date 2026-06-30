import "server-only";
import { getSiteUrl } from "@/lib/supabase/env";

type SendMentionEmailInput = {
  to: string;
  actorLabel: string;
  documentTitle: string;
  commentBody: string;
  href: string;
};

type EmailDeliveryResult =
  | { status: "not-configured"; error?: string }
  | { status: "sent"; providerId?: string }
  | { status: "failed"; error: string };

function getResendApiKey() {
  return process.env.RESEND_API_KEY?.trim() ?? "";
}

function getNotificationFromEmail() {
  return (
    process.env.CREED_NOTIFICATION_FROM_EMAIL?.trim() ??
    process.env.RESEND_FROM_EMAIL?.trim() ??
    ""
  );
}

export function isNotificationEmailConfigured() {
  return Boolean(getResendApiKey() && getNotificationFromEmail());
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trim()}...`;
}

export async function sendMentionNotificationEmail(
  input: SendMentionEmailInput
): Promise<EmailDeliveryResult> {
  const apiKey = getResendApiKey();
  const from = getNotificationFromEmail();

  if (!apiKey || !from) {
    return {
      status: "not-configured",
      error: "RESEND_API_KEY and CREED_NOTIFICATION_FROM_EMAIL are required.",
    };
  }

  const siteUrl = getSiteUrl().replace(/\/+$/g, "");
  const href = input.href.startsWith("http") ? input.href : `${siteUrl}${input.href}`;
  const bodyPreview = truncate(input.commentBody, 220);
  const subject = `${input.actorLabel} mentioned you in ${input.documentTitle}`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1C1C1A">
      <p style="font-size:14px;color:#6B6B66;margin:0 0 16px">Creed mention</p>
      <h1 style="font-size:20px;line-height:1.25;margin:0 0 12px">${escapeHtml(input.documentTitle)}</h1>
      <p style="font-size:15px;margin:0 0 16px">${escapeHtml(input.actorLabel)} mentioned you:</p>
      <blockquote style="border-left:3px solid #2563EB;margin:0 0 20px;padding:8px 0 8px 14px;color:#3F3F3A">
        ${escapeHtml(bodyPreview)}
      </blockquote>
      <a href="${escapeHtml(href)}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;border-radius:8px;padding:10px 14px;font-size:14px;font-weight:600">
        Open comment
      </a>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject,
      html,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; error?: string }
    | null;

  if (!response.ok) {
    return {
      status: "failed",
      error: payload?.message ?? payload?.error ?? `Resend returned ${response.status}.`,
    };
  }

  return { status: "sent", providerId: payload?.id };
}

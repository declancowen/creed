import { NextResponse } from "next/server";
import { requireApiAuth, requireApiJson } from "@/lib/api-auth";
import {
  isDocumentGroupKey,
  isDocumentPropertyKey,
  isDocumentSortDirection,
  isDocumentSortKey,
  isDocumentViewMode,
  type DocumentDashboardPreferences,
} from "@/lib/document-properties";
import { saveDocumentDashboardPreferences, readDocumentDashboardPreferences } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const preferences = await readDocumentDashboardPreferences(getSupabaseAdminClient(), auth.user.id);
  return NextResponse.json({ preferences });
}

export async function PUT(request: Request) {
  const json = await requireApiJson(request);
  if (json instanceof NextResponse) return json;

  const { auth, input } = json;
  const scope = input.scope === "global" ? "global" : "user";
  const preferencesInput =
    input.preferences && typeof input.preferences === "object"
      ? input.preferences as Record<string, unknown>
      : input;
  const preferences: Partial<DocumentDashboardPreferences> = {};
  if (isDocumentViewMode(preferencesInput.viewMode)) preferences.viewMode = preferencesInput.viewMode;
  if (isDocumentGroupKey(preferencesInput.groupBy)) preferences.groupBy = preferencesInput.groupBy;
  if (isDocumentSortKey(preferencesInput.sortBy)) preferences.sortBy = preferencesInput.sortBy;
  if (isDocumentSortDirection(preferencesInput.sortDir)) preferences.sortDir = preferencesInput.sortDir;
  if (Array.isArray(preferencesInput.visibleProperties)) {
    preferences.visibleProperties = preferencesInput.visibleProperties.filter(isDocumentPropertyKey);
  }

  const result = await saveDocumentDashboardPreferences(getSupabaseAdminClient(), {
    userId: auth.user.id,
    scope,
    preferences,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ preferences: result.value });
}

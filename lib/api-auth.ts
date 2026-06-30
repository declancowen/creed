import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthContext = {
  supabase: SupabaseClient;
  user: User;
};

export type JsonAuthContext = {
  auth: AuthContext;
  input: Record<string, unknown>;
};

export async function requireApiAuth(): Promise<AuthContext | NextResponse> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { supabase, user };
}

export async function requireApiJson(request: Request): Promise<JsonAuthContext | NextResponse> {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  return { auth, input };
}

export function apiResultErrorResponse(error: string, code?: string) {
  return NextResponse.json(
    { error },
    { status: code === "conflict" ? 409 : code === "not-found" ? 404 : 400 }
  );
}

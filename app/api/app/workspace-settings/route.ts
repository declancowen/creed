import { NextResponse } from "next/server";
import { apiResultErrorResponse, requireApiAuth, requireApiJson } from "@/lib/api-auth";
import {
  isEditPolicyValue,
  readWorkspaceEditPolicy,
  saveWorkspaceEditPolicy,
  type WorkspaceEditPolicy,
} from "@/lib/workspace-settings";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const admin = getSupabaseAdminClient();
  const policy = await readWorkspaceEditPolicy(admin);
  return NextResponse.json({ policy });
}

export async function PUT(request: Request) {
  const json = await requireApiJson(request);
  if (json instanceof NextResponse) return json;

  const { auth, input } = json;
  const patch: Partial<WorkspaceEditPolicy> = {};
  if (input.human !== undefined) {
    if (!isEditPolicyValue(input.human)) {
      return NextResponse.json({ error: "Invalid human edit policy." }, { status: 400 });
    }
    patch.human = input.human;
  }
  if (input.agent !== undefined) {
    if (!isEditPolicyValue(input.agent)) {
      return NextResponse.json({ error: "Invalid agent edit policy." }, { status: 400 });
    }
    patch.agent = input.agent;
  }

  if (patch.human === undefined && patch.agent === undefined) {
    return NextResponse.json({ error: "No edit policy values were provided." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const result = await saveWorkspaceEditPolicy(admin, { patch, actorUserId: auth.user.id });
  if (!result.ok) {
    return apiResultErrorResponse(result.error, result.code);
  }

  return NextResponse.json({ policy: result.value });
}

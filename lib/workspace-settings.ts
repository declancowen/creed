import "server-only";
import { log } from "@/lib/observability";
import type { SupabaseLikeClient } from "@/lib/supabase/types";

// The workspace edit policy governs how each actor type may change shared
// documents. It is a workspace-level singleton (one row), read on every edit to
// decide whether a change is rejected, turned into a proposal, or applied.

export type ActorType = "human" | "agent";

export const EDIT_POLICY_VALUES = ["cant-edit", "propose", "direct"] as const;
export type EditPolicyValue = (typeof EDIT_POLICY_VALUES)[number];

export type WorkspaceEditPolicy = {
  human: EditPolicyValue;
  agent: EditPolicyValue;
};

const DEFAULT_POLICY: EditPolicyValue = "propose";

export const DEFAULT_WORKSPACE_EDIT_POLICY: WorkspaceEditPolicy = {
  human: DEFAULT_POLICY,
  agent: DEFAULT_POLICY,
};

type MutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code: "invalid" };

type WorkspaceSettingsRow = {
  human_edit_policy: string | null;
  agent_edit_policy: string | null;
};

export function isEditPolicyValue(value: unknown): value is EditPolicyValue {
  return typeof value === "string" && (EDIT_POLICY_VALUES as readonly string[]).includes(value);
}

function normalizePolicy(value: unknown): EditPolicyValue {
  return isEditPolicyValue(value) ? value : DEFAULT_POLICY;
}

function nowIso() {
  return new Date().toISOString();
}

// The two policies are independent; unset (or invalid) values fall back to the
// `propose` default so the workspace is never left without a policy.
export async function readWorkspaceEditPolicy(client: unknown): Promise<WorkspaceEditPolicy> {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_workspace_settings")
    .select("human_edit_policy, agent_edit_policy")
    .eq("id", true)
    .maybeSingle()) as {
    data: WorkspaceSettingsRow | null;
    error: { message: string } | null;
  };

  if (error) {
    // The settings table may not exist yet (migration not applied). Fall back
    // to defaults so the settings UI stays usable rather than hard-failing.
    log.warn("workspace_settings_read_failed", {}, error);
    return { ...DEFAULT_WORKSPACE_EDIT_POLICY };
  }

  return {
    human: normalizePolicy(data?.human_edit_policy),
    agent: normalizePolicy(data?.agent_edit_policy),
  };
}

export async function policyForActor(
  client: unknown,
  actorType: ActorType
): Promise<EditPolicyValue> {
  const policy = await readWorkspaceEditPolicy(client);
  return actorType === "agent" ? policy.agent : policy.human;
}

export async function saveWorkspaceEditPolicy(
  client: unknown,
  input: {
    patch: Partial<WorkspaceEditPolicy>;
    actorUserId?: string | null;
  }
): Promise<MutationResult<WorkspaceEditPolicy>> {
  if (input.patch.human !== undefined && !isEditPolicyValue(input.patch.human)) {
    return { ok: false, code: "invalid", error: "Invalid human edit policy." };
  }
  if (input.patch.agent !== undefined && !isEditPolicyValue(input.patch.agent)) {
    return { ok: false, code: "invalid", error: "Invalid agent edit policy." };
  }

  // Read-merge-write so updating one policy never clobbers the other.
  const current = await readWorkspaceEditPolicy(client);
  const next: WorkspaceEditPolicy = {
    human: input.patch.human ?? current.human,
    agent: input.patch.agent ?? current.agent,
  };

  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_workspace_settings")
    .upsert({
      id: true,
      human_edit_policy: next.human,
      agent_edit_policy: next.agent,
      updated_by: input.actorUserId ?? null,
      updated_at: nowIso(),
    })
    .select("human_edit_policy, agent_edit_policy")
    .single()) as {
    data: WorkspaceSettingsRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "invalid", error: error.message };
  }

  return {
    ok: true,
    value: {
      human: normalizePolicy(data?.human_edit_policy),
      agent: normalizePolicy(data?.agent_edit_policy),
    },
  };
}

import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORKSPACE_EDIT_POLICY,
  readWorkspaceEditPolicy,
  saveWorkspaceEditPolicy,
} from "@/lib/workspace-settings";
import { FakeSupabaseClient } from "./helpers/fake-supabase";

describe("workspace-settings", () => {
  it("defaults both policies to `propose` when unset", async () => {
    const client = new FakeSupabaseClient();
    const policy = await readWorkspaceEditPolicy(client);
    expect(policy).toEqual({ human: "propose", agent: "propose" });
    expect(policy).toEqual(DEFAULT_WORKSPACE_EDIT_POLICY);
  });

  it("saving one policy leaves the other unchanged (independent evaluation)", async () => {
    const client = new FakeSupabaseClient();

    const savedHuman = await saveWorkspaceEditPolicy(client, { patch: { human: "direct" } });
    expect(savedHuman.ok).toBe(true);
    if (savedHuman.ok) {
      expect(savedHuman.value.human).toBe("direct");
      // Agent falls back to its existing (default) value.
      expect(savedHuman.value.agent).toBe("propose");
    }

    // Now change only the agent policy; human must be preserved.
    const savedAgent = await saveWorkspaceEditPolicy(client, { patch: { agent: "cant-edit" } });
    expect(savedAgent.ok).toBe(true);
    if (savedAgent.ok) {
      expect(savedAgent.value.human).toBe("direct");
      expect(savedAgent.value.agent).toBe("cant-edit");
    }

    const finalPolicy = await readWorkspaceEditPolicy(client);
    expect(finalPolicy).toEqual({ human: "direct", agent: "cant-edit" });
  });

  it("rejects an invalid policy value", async () => {
    const client = new FakeSupabaseClient();
    // Cast through unknown: the lib validates untrusted input at runtime.
    const result = await saveWorkspaceEditPolicy(client, {
      patch: { human: "nonsense" as unknown as "direct" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid");
  });
});

// Maps a free-text agent / client name to one of the fixed brand icon kinds.
// Lives in lib (not the "use client" agent-icon-stack) so server components,
// like the OAuth consent screen, can resolve a connecting client's icon too.
import type { AgentIconKind } from "@/lib/creed-data";

const agentAliases: Array<[AgentIconKind, string[]]> = [
  ["claude", ["claude", "claude code"]],
  ["codex", ["codex"]],
  ["openclaw", ["openclaw", "open claw", "open-claw", "clawdius", "claw"]],
  ["hermes", ["hermes"]],
  ["cursor", ["cursor"]],
  ["windsurf", ["windsurf"]],
  ["opencode", ["opencode", "open code", "open-code"]],
];

export function getAgentIconKind(value?: string | null): AgentIconKind {
  const normalized = value?.toLowerCase() ?? "";
  const match = agentAliases.find(([, aliases]) =>
    aliases.some((alias) => normalized.includes(alias))
  );

  return match?.[0] ?? "custom";
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, History, RotateCcw, X } from "@/components/ui/phosphor-icons";
import { Button } from "@/components/ui/button";
import {
  DiffBadge,
  computeDiffParts,
  summarizeDiff,
} from "@/components/creed/inline-proposal-diff";
import type { WorkspaceUser } from "@/lib/document-collaboration";
import type { SharedDocument } from "@/lib/shared-documents";
import { cn } from "@/lib/utils";

// Supabase-only review surface for a shared document: workspace-shared pending
// proposals (accept/reject) and the append-only version history (diff/revert).
// All actions hit the document proposal/version APIs and report back the
// updated document so the editor can re-render.

type ActorType = "human" | "agent";

type DocumentProposal = {
  id: string;
  actorType: ActorType;
  authorUserId: string | null;
  authorAgentLabel: string | null;
  content: string;
  summary: string;
  baseRevision: number;
  status: string;
  createdAt: string;
};

type DocumentVersion = {
  id: string;
  revision: number;
  content: string;
  actorType: ActorType;
  authorUserId: string | null;
  authorAgentLabel: string | null;
  summary: string;
  createdAt: string;
};

type EditOutcomeResponse = {
  outcome?: "applied" | "proposed";
  document?: SharedDocument;
  error?: string;
};

function relativeTime(iso: string) {
  const deltaMs = Math.max(Date.now() - new Date(iso).getTime(), 0);
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function DiffBody({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => computeDiffParts(before, after), [before, after]);
  return (
    <div className="creed-diff-block max-h-[240px] overflow-y-auto rounded-[10px] bg-[var(--creed-surface)] px-3.5 py-3 text-[13px] leading-6">
      {parts.map((part, index) => {
        if (part.added) return <span key={index} className="creed-diff-add">{part.value}</span>;
        if (part.removed) return <span key={index} className="creed-diff-remove">{part.value}</span>;
        return <span key={index}>{part.value}</span>;
      })}
    </div>
  );
}

export function DocumentReviewPanel({
  documentId,
  revision,
  currentContent,
  users,
  refreshSignal,
  onDocumentUpdated,
}: {
  documentId: string;
  revision: number;
  currentContent: string;
  users: WorkspaceUser[];
  refreshSignal?: number;
  onDocumentUpdated: (document: SharedDocument) => void;
}) {
  const [proposals, setProposals] = useState<DocumentProposal[]>([]);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedProposal, setExpandedProposal] = useState<string | null>(null);
  const [busyProposal, setBusyProposal] = useState<string | null>(null);
  const [revertingVersion, setRevertingVersion] = useState<string | null>(null);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const attribution = useCallback(
    (actorType: ActorType, authorUserId: string | null, agentLabel: string | null) => {
      if (actorType === "agent") return agentLabel || "Agent";
      if (authorUserId) return usersById.get(authorUserId)?.label || "Someone";
      return "Someone";
    },
    [usersById]
  );

  const refresh = useCallback(async () => {
    try {
      const [proposalsRes, versionsRes] = await Promise.all([
        fetch(`/api/app/documents/${encodeURIComponent(documentId)}/proposals`, { cache: "no-store" }),
        fetch(`/api/app/documents/${encodeURIComponent(documentId)}/versions`, { cache: "no-store" }),
      ]);
      if (proposalsRes.ok) {
        const payload = (await proposalsRes.json()) as { proposals?: DocumentProposal[] };
        setProposals(payload.proposals ?? []);
      }
      if (versionsRes.ok) {
        const payload = (await versionsRes.json()) as { versions?: DocumentVersion[] };
        setVersions(payload.versions ?? []);
      }
    } catch {
      // Non-fatal: leave the last known lists in place.
    }
  }, [documentId]);

  // Refetch when the document changes (id or applied revision) or when the
  // parent signals a new proposal was created (a proposal does not advance the
  // document revision, so revision alone would miss it).
  useEffect(() => {
    void refresh();
  }, [refresh, revision, refreshSignal]);

  // Keep proposals/versions live for the whole workspace: another member (or an
  // agent over MCP) can create or resolve a proposal without changing anything
  // this client knows about. Mirror the app's existing polling pattern
  // (creed-provider / notification-menu): poll on an interval, pause when the
  // tab is hidden, and refetch immediately on focus.
  useEffect(() => {
    let interval: number | null = null;

    function start() {
      stop();
      interval = window.setInterval(() => void refresh(), 30_000);
    }
    function stop() {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
    }
    function onFocus() {
      void refresh();
      start();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else {
        stop();
      }
    }

    if (document.visibilityState === "visible") start();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  async function resolveProposal(id: string, action: "accept" | "reject") {
    setBusyProposal(id);
    try {
      const response = await fetch(
        `/api/app/documents/${encodeURIComponent(documentId)}/proposals/${encodeURIComponent(id)}/${action}`,
        { method: "POST" }
      );
      const payload = (await response.json()) as EditOutcomeResponse & { proposal?: unknown };
      if (!response.ok) {
        throw new Error(payload.error || `Could not ${action} the proposal.`);
      }
      if (action === "accept" && payload.document) {
        onDocumentUpdated(payload.document);
      }
      toast.success(action === "accept" ? "Proposal accepted" : "Proposal rejected");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action} the proposal.`);
    } finally {
      setBusyProposal(null);
    }
  }

  async function revertTo(versionId: string) {
    setRevertingVersion(versionId);
    try {
      const response = await fetch(
        `/api/app/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/revert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedRevision: revision }),
        }
      );
      const payload = (await response.json()) as EditOutcomeResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Could not revert.");
      }
      if (payload.outcome === "applied" && payload.document) {
        onDocumentUpdated(payload.document);
        toast.success("Reverted to the selected version");
      } else {
        toast.success("Revert proposed for review");
      }
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revert.");
    } finally {
      setRevertingVersion(null);
    }
  }

  const hasProposals = proposals.length > 0;

  if (!hasProposals && versions.length === 0) {
    return null;
  }

  return (
    <div className="mt-5 space-y-3">
      {hasProposals ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--creed-border)] px-4 py-2.5">
            <span className="text-[13px] font-medium text-[var(--creed-text-primary)]">
              {proposals.length} pending {proposals.length === 1 ? "proposal" : "proposals"}
            </span>
          </div>
          <div className="divide-y divide-[var(--creed-border)]">
            {proposals.map((proposal) => {
              const parts = computeDiffParts(currentContent, proposal.content);
              const stats = summarizeDiff(parts);
              const expanded = expandedProposal === proposal.id;
              const busy = busyProposal === proposal.id;
              return (
                <div key={proposal.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandedProposal(expanded ? null : proposal.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-expanded={expanded}
                    >
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-200",
                          expanded ? "rotate-0" : "-rotate-90"
                        )}
                      />
                      <span className="truncate text-[13px] text-[var(--creed-text-primary)]">
                        <span className="font-medium">
                          {attribution(proposal.actorType, proposal.authorUserId, proposal.authorAgentLabel)}
                        </span>
                        <span className="text-[var(--creed-text-secondary)]">
                          {" "}
                          {proposal.actorType === "agent" ? "proposed an edit" : "proposed a change"} ·{" "}
                          {relativeTime(proposal.createdAt)}
                        </span>
                      </span>
                      <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
                        <DiffBadge tone="added" count={stats.added} />
                        <DiffBadge tone="removed" count={stats.removed} />
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 rounded-md px-2 text-[12px] text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
                        disabled={busy}
                        onClick={() => void resolveProposal(proposal.id, "reject")}
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 gap-1 rounded-md bg-[var(--creed-accent)] px-2.5 text-[12px] text-white hover:bg-[var(--creed-accent-hover)]"
                        disabled={busy}
                        onClick={() => void resolveProposal(proposal.id, "accept")}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Accept
                      </Button>
                    </div>
                  </div>
                  <AnimatePresence initial={false}>
                    {expanded ? (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="pt-3">
                          <DiffBody before={currentContent} after={proposal.content} />
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {versions.length > 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <button
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            className="flex w-full items-center justify-between px-4 py-2.5"
            aria-expanded={historyOpen}
          >
            <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--creed-text-primary)]">
              <History className="h-3.5 w-3.5" />
              Version history
              <span className="text-[var(--creed-text-tertiary)]">({versions.length})</span>
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-[var(--creed-text-tertiary)] transition-transform duration-200",
                historyOpen ? "rotate-180" : "rotate-0"
              )}
            />
          </button>
          <AnimatePresence initial={false}>
            {historyOpen ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="divide-y divide-[var(--creed-border)] border-t border-[var(--creed-border)]">
                  {versions.map((version, index) => (
                    <div key={version.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] text-[var(--creed-text-primary)]">
                          {version.summary || `Revision ${version.revision}`}
                        </div>
                        <div className="text-[12px] text-[var(--creed-text-secondary)]">
                          {attribution(version.actorType, version.authorUserId, version.authorAgentLabel)} ·{" "}
                          {relativeTime(version.createdAt)}
                        </div>
                      </div>
                      {index === 0 ? (
                        <span className="shrink-0 rounded-full bg-[var(--creed-surface-raised)] px-2 py-0.5 text-[11px] text-[var(--creed-text-secondary)]">
                          Current
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 gap-1 rounded-md px-2 text-[12px] text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
                          disabled={revertingVersion === version.id}
                          onClick={() => void revertTo(version.id)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Revert
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  );
}

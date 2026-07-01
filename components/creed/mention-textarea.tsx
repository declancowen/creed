"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import type { WorkspaceUser } from "@/lib/document-collaboration";
import { cn } from "@/lib/utils";

// A textarea with "@" mention autocomplete against workspace display names.
// Selecting a person inserts "@Display Name" into the text; callers derive the
// mentioned user ids from the final body (matching "@label"). Search is by
// display name only - emails are never surfaced or inserted.
export function MentionTextarea({
  value,
  onChange,
  users,
  placeholder,
  autoFocus,
  className,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  users: WorkspaceUser[];
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  onSubmit?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const matches = useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.toLowerCase();
    return users
      .filter((user) => user.label.toLowerCase().includes(query))
      .slice(0, 6);
  }, [mentionQuery, users]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery]);

  function syncMentionQuery(text: string, caret: number) {
    const upToCaret = text.slice(0, caret);
    const match = /(^|\s)@([^@\s]*)$/.exec(upToCaret);
    setMentionQuery(match ? match[2] : null);
  }

  function insertMention(user: WorkspaceUser) {
    const el = textareaRef.current;
    const caret = el ? el.selectionStart : value.length;
    const upToCaret = value.slice(0, caret);
    const match = /(^|\s)@([^@\s]*)$/.exec(upToCaret);
    if (!match) return;
    const tokenStart = caret - match[2].length - 1; // include the '@'
    const insertText = `@${user.label} `;
    const next = value.slice(0, tokenStart) + insertText + value.slice(caret);
    onChange(next);
    setMentionQuery(null);
    const nextCaret = tokenStart + insertText.length;
    window.requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (node) {
        node.focus();
        node.setSelectionRange(nextCaret, nextCaret);
      }
    });
  }

  const open = mentionQuery !== null && matches.length > 0;

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          syncMentionQuery(event.target.value, event.target.selectionStart);
        }}
        onKeyUp={(event) => {
          const node = event.currentTarget;
          syncMentionQuery(node.value, node.selectionStart);
        }}
        onClick={(event) => {
          const node = event.currentTarget;
          syncMentionQuery(node.value, node.selectionStart);
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn("resize-none bg-[var(--creed-surface)] text-sm", className)}
        onKeyDown={(event) => {
          if (open) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setMentionIndex((index) => (index + 1) % matches.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setMentionIndex((index) => (index - 1 + matches.length) % matches.length);
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              insertMention(matches[mentionIndex]);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setMentionQuery(null);
              return;
            }
          }
          if (onSubmit && (event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
        }}
      />

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface)] p-1 shadow-[0_10px_30px_rgba(28,28,26,0.14)]">
          {matches.map((user, index) => (
            <button
              key={user.id}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                insertMention(user);
              }}
              onMouseEnter={() => setMentionIndex(index)}
              className={cn(
                "flex w-full items-center rounded-md px-2.5 py-1.5 text-left transition-colors",
                index === mentionIndex
                  ? "bg-[var(--creed-surface-raised)]"
                  : "hover:bg-[var(--creed-surface-raised)]"
              )}
            >
              <span className="text-[13px] font-medium text-[var(--creed-text-primary)]">
                {user.label}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

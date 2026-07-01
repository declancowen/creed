"use client";

// Linear-style create modal for the documents dashboard.
//
// A single focused modal opened from the "New" dropdown that can create either
// a document or a folder. A segmented toggle at the top switches between the
// two modes; the dropdown sets the initial mode. The title/name is a large
// borderless input, and (for documents) properties are inline chip pickers
// along the bottom. A footer carries Cancel / Create, and Cmd/Ctrl+Enter
// submits.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CircleDashed,
  FileText,
  Flag,
  Folder,
  LayoutGrid,
  LoaderCircle,
  RotateCcw,
  Tag,
  TShirt,
  X,
} from "@/components/ui/phosphor-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DOCUMENT_LIFECYCLE_OPTIONS,
  DOCUMENT_PRIORITY_OPTIONS,
  DOCUMENT_SIZE_OPTIONS,
  DOCUMENT_STAGE_OPTIONS,
  DOCUMENT_STATUS_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  defaultLifecycleForStage,
  lifecycleStage,
  type DocumentLifecycle,
  type DocumentPriority,
  type DocumentSize,
  type DocumentStage,
  type DocumentStatus,
  type DocumentType,
} from "@/lib/document-properties";
import type { SharedDocumentFolder, SharedDocumentSummary } from "@/lib/shared-documents";
import { cn } from "@/lib/utils";

export type CreateDialogMode = "document" | "folder";

async function readError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || fallback;
}

// A compact chip with a dropdown of options - the inline property pickers that
// sit at the bottom of the create modal.
function PropertyChip<T extends string>({
  icon,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  const current = options.find((option) => option.value === value)?.label ?? value;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-[var(--creed-border)] bg-[var(--creed-surface)] px-2 text-[12.5px] font-medium text-[var(--creed-text-secondary)] transition hover:bg-[var(--creed-surface-raised)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-[var(--creed-text-tertiary)]">{icon}</span>
          <span className="text-[var(--creed-text-primary)]">{current}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[190px]">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Segmented Document / Folder switch shown at the top of the modal.
function ModeSwitch({
  mode,
  disabled,
  onChange,
}: {
  mode: CreateDialogMode;
  disabled?: boolean;
  onChange: (mode: CreateDialogMode) => void;
}) {
  const options: Array<{ value: CreateDialogMode; label: string; icon: ReactNode }> = [
    { value: "document", label: "Document", icon: <FileText className="h-3.5 w-3.5" strokeWidth={1.8} /> },
    { value: "folder", label: "Folder", icon: <Folder className="h-3.5 w-3.5" strokeWidth={1.8} /> },
  ];

  return (
    <div className="inline-flex h-7 items-center rounded-[8px] border border-[var(--creed-border)] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          aria-pressed={mode === option.value}
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium text-[var(--creed-text-tertiary)] transition disabled:cursor-not-allowed disabled:opacity-50",
            mode === option.value &&
              "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)]"
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function CreateDialog({
  open,
  onOpenChange,
  mode,
  onModeChange,
  folders,
  defaultFolderId,
  onDocumentCreated,
  onFolderCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: CreateDialogMode;
  onModeChange: (mode: CreateDialogMode) => void;
  folders: SharedDocumentFolder[];
  defaultFolderId?: string | null;
  onDocumentCreated?: (document: SharedDocumentSummary) => void;
  onFolderCreated?: (folder: SharedDocumentFolder) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [folderId, setFolderId] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("feature");
  const [status, setStatus] = useState<DocumentStatus>("backlog");
  const [stage, setStage] = useState<DocumentStage>("discovery");
  const [lifecycle, setLifecycle] = useState<DocumentLifecycle>("ideation");
  const [priority, setPriority] = useState<DocumentPriority>("medium");
  const [size, setSize] = useState<DocumentSize>("m");
  const [folderName, setFolderName] = useState("");
  const [parentFolderId, setParentFolderId] = useState("");
  const [creating, setCreating] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Reset to a clean slate every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setFolderId(defaultFolderId ?? "");
    setDocumentType("feature");
    setStatus("backlog");
    setStage("discovery");
    setLifecycle("ideation");
    setPriority("medium");
    setSize("m");
    setFolderName("");
    setParentFolderId(defaultFolderId ?? "");
    setCreating(false);
  }, [open, defaultFolderId]);

  const folderOptions = [
    { value: "", label: "No folder" },
    ...folders.map((folder) => ({ value: folder.id, label: folder.path })),
  ];
  const parentFolderOptions = [
    { value: "", label: "No parent" },
    ...folders.map((folder) => ({ value: folder.id, label: folder.path })),
  ];

  function handleStageChange(value: DocumentStage) {
    setStage(value);
    setLifecycle(defaultLifecycleForStage(value));
  }

  function handleLifecycleChange(value: DocumentLifecycle) {
    setLifecycle(value);
    setStage(lifecycleStage(value));
  }

  async function handleCreateDocument() {
    if (creating || !title.trim()) return;
    try {
      setCreating(true);
      const response = await fetch("/api/app/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          folderId: folderId || null,
          documentType,
          status,
          stage,
          lifecycle,
          priority,
          size,
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not create document."));
      }
      const payload = (await response.json()) as { document?: SharedDocumentSummary };
      toast.success("Document created");
      onOpenChange(false);
      if (payload.document) {
        onDocumentCreated?.(payload.document);
        router.push(`/file?document=${encodeURIComponent(payload.document.slug)}`);
      } else {
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create document.");
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateFolder() {
    if (creating || !folderName.trim()) return;
    try {
      setCreating(true);
      const response = await fetch("/api/app/document-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: folderName.trim(),
          parentFolderId: parentFolderId || null,
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not create folder."));
      }
      const payload = (await response.json()) as { folder?: SharedDocumentFolder };
      toast.success("Folder created");
      onOpenChange(false);
      if (payload.folder) {
        onFolderCreated?.(payload.folder);
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create folder.");
    } finally {
      setCreating(false);
    }
  }

  function handleCreate() {
    if (mode === "folder") {
      void handleCreateFolder();
    } else {
      void handleCreateDocument();
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      handleCreate();
    }
  }

  const isFolder = mode === "folder";
  const canCreate = isFolder ? Boolean(folderName.trim()) : Boolean(title.trim());

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (creating) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        onKeyDown={handleKeyDown}
        className="gap-0 overflow-hidden p-0 sm:max-w-[580px]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{isFolder ? "New folder" : "New document"}</DialogTitle>
          <DialogDescription>
            {isFolder ? "Create a folder for shared documents." : "Create a shared Markdown document."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-[var(--creed-border)] px-4 py-2.5">
          <ModeSwitch mode={mode} disabled={creating} onChange={onModeChange} />
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Close"
              className="ml-auto inline-grid size-7 place-items-center rounded-md text-[var(--creed-text-tertiary)] transition hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogClose>
        </div>

        {isFolder ? (
          <div className="px-4 pt-4 pb-1">
            <input
              value={folderName}
              autoFocus
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="Folder name"
              className="w-full border-none bg-transparent px-0 text-[20px] font-semibold tracking-[-0.01em] text-[var(--creed-text-primary)] outline-none placeholder:font-medium placeholder:text-[var(--creed-text-tertiary)]"
            />
          </div>
        ) : (
          <div className="px-4 pt-4 pb-1">
            <input
              ref={titleRef}
              value={title}
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Document title"
              className="w-full border-none bg-transparent px-0 text-[20px] font-semibold tracking-[-0.01em] text-[var(--creed-text-primary)] outline-none placeholder:font-medium placeholder:text-[var(--creed-text-tertiary)]"
            />
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add a description"
              className="mt-1.5 w-full border-none bg-transparent px-0 text-[14px] text-[var(--creed-text-secondary)] outline-none placeholder:text-[var(--creed-text-tertiary)]"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--creed-border)] px-4 py-2.5">
          {isFolder ? (
            <PropertyChip
              icon={<Folder className="h-3.5 w-3.5" strokeWidth={1.8} />}
              label="Parent folder"
              value={parentFolderId}
              options={parentFolderOptions}
              disabled={creating}
              onChange={setParentFolderId}
            />
          ) : (
            <>
              <PropertyChip
                icon={<Folder className="h-3.5 w-3.5" strokeWidth={1.8} />}
                label="Folder"
                value={folderId}
                options={folderOptions}
                disabled={creating}
                onChange={setFolderId}
              />
              <PropertyChip
                icon={<Tag className="h-3.5 w-3.5" strokeWidth={1.8} />}
                label="Type"
                value={documentType}
                options={DOCUMENT_TYPE_OPTIONS}
                disabled={creating}
                onChange={setDocumentType}
              />
              <PropertyChip
                icon={<CircleDashed className="h-3.5 w-3.5" strokeWidth={1.8} />}
                label="Status"
                value={status}
                options={DOCUMENT_STATUS_OPTIONS}
                disabled={creating}
                onChange={setStatus}
              />
              <PropertyChip
                icon={<LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.8} />}
                label="Stage"
                value={stage}
                options={DOCUMENT_STAGE_OPTIONS}
                disabled={creating}
                onChange={handleStageChange}
              />
              <PropertyChip
                icon={<RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} />}
                label="Lifecycle"
                value={lifecycle}
                options={DOCUMENT_LIFECYCLE_OPTIONS}
                disabled={creating}
                onChange={handleLifecycleChange}
              />
              <PropertyChip
                icon={<Flag className="h-3.5 w-3.5" strokeWidth={1.8} />}
                label="Priority"
                value={priority}
                options={DOCUMENT_PRIORITY_OPTIONS}
                disabled={creating}
                onChange={setPriority}
              />
              <PropertyChip
                icon={<TShirt className="h-3.5 w-3.5" strokeWidth={1.8} />}
                label="Size"
                value={size}
                options={DOCUMENT_SIZE_OPTIONS}
                disabled={creating}
                onChange={setSize}
              />
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--creed-border)] bg-[var(--creed-surface-raised)]/40 px-4 py-3">
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm" disabled={creating}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            size="sm"
            disabled={creating || !canCreate}
            onClick={handleCreate}
            className="gap-1.5"
          >
            {creating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
            {isFolder ? "Create folder" : "Create document"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

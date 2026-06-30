import "server-only";
import { log } from "@/lib/observability";
import { isNotificationEmailConfigured, sendMentionNotificationEmail } from "@/lib/notification-email";
import { readSharedDocumentById } from "@/lib/shared-documents";
import type { SupabaseLikeClient } from "@/lib/supabase/types";

type MutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code: "conflict" | "invalid" | "not-found" };

export type WorkspaceUser = {
  id: string;
  email: string;
  label: string;
};

export type DocumentComment = {
  id: string;
  documentId: string;
  parentId: string | null;
  referenceId: string | null;
  referenceQuote: string;
  body: string;
  status: "open" | "resolved";
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdBy: string | null;
  authorLabel: string;
  authorEmail: string;
  mentionedUserIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type DocumentActivityEvent = {
  id: string;
  documentId: string;
  actorUserId: string | null;
  actorLabel: string;
  action: string;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type DocumentNotification = {
  id: string;
  userId: string;
  actorUserId: string | null;
  documentId: string | null;
  commentId: string | null;
  type: string;
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  emailStatus: "not-configured" | "pending" | "sent" | "failed";
  emailError: string | null;
  createdAt: string;
};

type CommentRow = {
  id: string;
  document_id: string;
  parent_id: string | null;
  reference_id: string | null;
  reference_quote: string | null;
  body: string;
  status: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type ActivityRow = {
  id: string;
  document_id: string;
  actor_user_id: string | null;
  action: string;
  summary: string | null;
  metadata: unknown;
  created_at: string;
};

type NotificationRow = {
  id: string;
  user_id: string;
  actor_user_id: string | null;
  document_id: string | null;
  comment_id: string | null;
  type: string;
  title: string;
  body: string | null;
  href: string;
  read_at: string | null;
  email_status: string | null;
  email_error: string | null;
  created_at: string;
};

type MentionRow = {
  comment_id: string;
  user_id: string;
};

type PendingEmailNotification = {
  notificationId: string;
  to: string;
  actorLabel: string;
  documentTitle: string;
  commentBody: string;
  href: string;
};

export type CreatedCommentResult = {
  comment: DocumentComment;
  notifications: DocumentNotification[];
  pendingEmails: PendingEmailNotification[];
};

const COMMENT_COLUMNS = [
  "id",
  "document_id",
  "parent_id",
  "reference_id",
  "reference_quote",
  "body",
  "status",
  "resolved_at",
  "resolved_by",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
].join(", ");

const ACTIVITY_COLUMNS = [
  "id",
  "document_id",
  "actor_user_id",
  "action",
  "summary",
  "metadata",
  "created_at",
].join(", ");

const NOTIFICATION_COLUMNS = [
  "id",
  "user_id",
  "actor_user_id",
  "document_id",
  "comment_id",
  "type",
  "title",
  "body",
  "href",
  "read_at",
  "email_status",
  "email_error",
  "created_at",
].join(", ");

function nowIso() {
  return new Date().toISOString();
}

function trimToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function metadataString(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function buildUserLabel(user: WorkspaceUser | undefined, fallback?: string | null) {
  return user?.label || fallback || "Someone";
}

function mapMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function mapComment(
  row: CommentRow,
  users: Map<string, WorkspaceUser>,
  mentionsByComment: Map<string, string[]>
): DocumentComment {
  const author = row.created_by ? users.get(row.created_by) : undefined;
  return {
    id: row.id,
    documentId: row.document_id,
    parentId: row.parent_id,
    referenceId: row.reference_id,
    referenceQuote: row.reference_quote ?? "",
    body: row.body,
    status: row.status === "resolved" ? "resolved" : "open",
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    createdBy: row.created_by,
    authorLabel: buildUserLabel(author, row.created_by),
    authorEmail: author?.email ?? "",
    mentionedUserIds: mentionsByComment.get(row.id) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapActivity(row: ActivityRow, users: Map<string, WorkspaceUser>): DocumentActivityEvent {
  return {
    id: row.id,
    documentId: row.document_id,
    actorUserId: row.actor_user_id,
    actorLabel: buildUserLabel(row.actor_user_id ? users.get(row.actor_user_id) : undefined, row.actor_user_id),
    action: row.action,
    summary: row.summary ?? "",
    metadata: mapMetadata(row.metadata),
    createdAt: row.created_at,
  };
}

function mapNotification(row: NotificationRow): DocumentNotification {
  const emailStatus =
    row.email_status === "pending" ||
    row.email_status === "sent" ||
    row.email_status === "failed"
      ? row.email_status
      : "not-configured";
  return {
    id: row.id,
    userId: row.user_id,
    actorUserId: row.actor_user_id,
    documentId: row.document_id,
    commentId: row.comment_id,
    type: row.type,
    title: row.title,
    body: row.body ?? "",
    href: row.href,
    readAt: row.read_at,
    emailStatus,
    emailError: row.email_error,
    createdAt: row.created_at,
  };
}

function mentionEmailsFromBody(body: string) {
  const emails = new Set<string>();
  const matches = body.matchAll(/@([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi);
  for (const match of matches) {
    const email = match[1]?.trim().toLowerCase();
    if (email) emails.add(email);
  }
  return emails;
}

export async function listWorkspaceUsers(client: unknown): Promise<WorkspaceUser[]> {
  const db = client as SupabaseLikeClient;
  if (!db.auth?.admin?.listUsers) {
    return [];
  }

  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) {
    throw new Error(error.message || "Could not load users.");
  }

  return data.users
    .filter((user) => Boolean(user.email))
    .map((user) => {
      const metadata = mapMetadata(user.user_metadata);
      const email = user.email?.trim().toLowerCase() ?? "";
      const label =
        metadataString(metadata, ["full_name", "name", "user_name", "preferred_username"]) ||
        email ||
        user.id;
      return { id: user.id, email, label };
    });
}

async function userMap(client: unknown) {
  const users = await listWorkspaceUsers(client);
  return new Map(users.map((user) => [user.id, user]));
}

async function mentionUserIds(
  client: unknown,
  body: string,
  explicitUserIds: string[] | undefined,
  actorUserId?: string | null
) {
  const users = await listWorkspaceUsers(client);
  const usersByEmail = new Map(users.map((user) => [user.email, user]));
  const ids = new Set<string>();

  for (const userId of explicitUserIds ?? []) {
    if (users.some((user) => user.id === userId)) {
      ids.add(userId);
    }
  }
  for (const email of mentionEmailsFromBody(body)) {
    const user = usersByEmail.get(email);
    if (user) ids.add(user.id);
  }
  if (actorUserId) {
    ids.delete(actorUserId);
  }

  return {
    userIds: Array.from(ids),
    users,
  };
}

async function mentionsByComment(client: unknown, commentIds: string[]) {
  if (commentIds.length === 0) {
    return new Map<string, string[]>();
  }

  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_comment_mentions")
    .select("comment_id, user_id")
    .in("comment_id", commentIds)) as {
    data: MentionRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Could not load comment mentions.");
  }

  const map = new Map<string, string[]>();
  for (const row of data ?? []) {
    map.set(row.comment_id, [...(map.get(row.comment_id) ?? []), row.user_id]);
  }
  return map;
}

export async function listDocumentComments(client: unknown, documentId: string) {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_comments")
    .select(COMMENT_COLUMNS)
    .eq("document_id", documentId)
    .order("created_at", { ascending: true })) as {
    data: CommentRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Could not load comments.");
  }

  const rows = data ?? [];
  const [users, mentions] = await Promise.all([
    userMap(client),
    mentionsByComment(client, rows.map((row) => row.id)),
  ]);
  return rows.map((row) => mapComment(row, users, mentions));
}

export async function recordDocumentActivity(
  client: unknown,
  input: {
    documentId: string;
    actorUserId?: string | null;
    action: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }
) {
  const db = client as SupabaseLikeClient;
  const { error } = (await db.from("creed_document_activity_events").insert({
    document_id: input.documentId,
    actor_user_id: input.actorUserId ?? null,
    action: input.action,
    summary: input.summary,
    metadata: input.metadata ?? {},
    created_at: nowIso(),
  })) as {
    data: unknown;
    error: { message: string } | null;
  };

  if (error) {
    log.warn("document_activity_write_failed", { documentId: input.documentId }, error);
  }
}

export async function listDocumentActivity(client: unknown, documentId: string) {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_activity_events")
    .select(ACTIVITY_COLUMNS)
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(100)) as {
    data: ActivityRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Could not load document activity.");
  }

  const users = await userMap(client);
  return (data ?? []).map((row) => mapActivity(row, users));
}

export async function createDocumentComment(
  client: unknown,
  input: {
    documentId: string;
    body: string;
    actorUserId?: string | null;
    parentId?: string | null;
    referenceId?: string | null;
    referenceQuote?: string | null;
    mentionedUserIds?: string[];
    source?: "creed" | "mcp";
  }
): Promise<MutationResult<CreatedCommentResult>> {
  const body = input.body.trim();
  if (!body) {
    return { ok: false, code: "invalid", error: "Comment body is required." };
  }

  const document = await readSharedDocumentById(client, input.documentId);
  if (!document) {
    return { ok: false, code: "not-found", error: "Document not found." };
  }

  if (input.parentId) {
    const db = client as SupabaseLikeClient;
    const { data, error } = (await db
      .from("creed_document_comments")
      .select("id, document_id")
      .eq("id", input.parentId)
      .eq("document_id", input.documentId)
      .maybeSingle()) as {
      data: { id: string; document_id: string } | null;
      error: { message: string } | null;
    };
    if (error) {
      return { ok: false, code: "invalid", error: error.message };
    }
    if (!data) {
      return { ok: false, code: "not-found", error: "Parent comment not found." };
    }
  }

  const { userIds: mentionedUserIds, users } = await mentionUserIds(
    client,
    body,
    input.mentionedUserIds,
    input.actorUserId
  );
  const now = nowIso();
  const emailConfigured = isNotificationEmailConfigured();
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_comments")
    .insert({
      document_id: input.documentId,
      parent_id: input.parentId ?? null,
      reference_id: trimToNull(input.referenceId),
      reference_quote: trimToNull(input.referenceQuote),
      body,
      status: "open",
      created_by: input.actorUserId ?? null,
      updated_by: input.actorUserId ?? null,
      created_at: now,
      updated_at: now,
    })
    .select(COMMENT_COLUMNS)
    .single()) as {
    data: CommentRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "invalid", error: error.message };
  }
  if (!data) {
    return { ok: false, code: "invalid", error: "Comment was not created." };
  }

  if (mentionedUserIds.length > 0) {
    const { error: mentionError } = (await db.from("creed_document_comment_mentions").insert(
      mentionedUserIds.map((userId) => ({
        comment_id: data.id,
        user_id: userId,
        created_at: now,
      }))
    )) as {
      data: unknown;
      error: { message: string } | null;
    };
    if (mentionError) {
      return { ok: false, code: "invalid", error: mentionError.message };
    }
  }

  const actor = users.find((user) => user.id === input.actorUserId);
  const actorLabel = buildUserLabel(actor, input.source === "mcp" ? "MCP agent" : "Someone");
  const href = `/file?document=${encodeURIComponent(document.slug)}&comment=${encodeURIComponent(data.id)}`;
  let notifications: DocumentNotification[] = [];
  if (mentionedUserIds.length > 0) {
    const { data: notificationRows, error: notificationError } = (await db
      .from("creed_notifications")
      .insert(
        mentionedUserIds.map((userId) => ({
          user_id: userId,
          actor_user_id: input.actorUserId ?? null,
          document_id: document.id,
          comment_id: data.id,
          type: "mention",
          title: `${actorLabel} mentioned you`,
          body,
          href,
          email_status: emailConfigured ? "pending" : "not-configured",
          created_at: now,
        }))
      )
      .select(NOTIFICATION_COLUMNS)) as {
      data: NotificationRow[] | null;
      error: { message: string } | null;
    };
    if (notificationError) {
      return { ok: false, code: "invalid", error: notificationError.message };
    }
    notifications = (notificationRows ?? []).map(mapNotification);
  }

  await recordDocumentActivity(client, {
    documentId: document.id,
    actorUserId: input.actorUserId,
    action: input.parentId ? "comment.reply.created" : "comment.created",
    summary: input.parentId ? "Replied to a comment" : "Added a comment",
    metadata: {
      commentId: data.id,
      source: input.source ?? "creed",
      mentionedUserIds,
    },
  });

  const mentions = new Map([[data.id, mentionedUserIds]]);
  const usersMap = new Map(users.map((user) => [user.id, user]));
  const pendingEmails = notifications.flatMap((notification) => {
    const target = users.find((user) => user.id === notification.userId);
    if (!target?.email || notification.emailStatus !== "pending") return [];
    return [{
      notificationId: notification.id,
      to: target.email,
      actorLabel,
      documentTitle: document.title,
      commentBody: body,
      href,
    }];
  });

  return {
    ok: true,
    value: {
      comment: mapComment(data, usersMap, mentions),
      notifications,
      pendingEmails,
    },
  };
}

export async function setDocumentCommentStatus(
  client: unknown,
  input: {
    commentId: string;
    status: "open" | "resolved";
    actorUserId?: string | null;
  }
): Promise<MutationResult<DocumentComment>> {
  const now = nowIso();
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_document_comments")
    .update({
      status: input.status,
      resolved_at: input.status === "resolved" ? now : null,
      resolved_by: input.status === "resolved" ? input.actorUserId ?? null : null,
      updated_by: input.actorUserId ?? null,
      updated_at: now,
    })
    .eq("id", input.commentId)
    .select(COMMENT_COLUMNS)
    .maybeSingle()) as {
    data: CommentRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "invalid", error: error.message };
  }
  if (!data) {
    return { ok: false, code: "not-found", error: "Comment not found." };
  }

  await recordDocumentActivity(client, {
    documentId: data.document_id,
    actorUserId: input.actorUserId,
    action: input.status === "resolved" ? "comment.resolved" : "comment.reopened",
    summary: input.status === "resolved" ? "Resolved a comment" : "Reopened a comment",
    metadata: { commentId: data.id },
  });

  const [users, mentions] = await Promise.all([
    userMap(client),
    mentionsByComment(client, [data.id]),
  ]);
  return { ok: true, value: mapComment(data, users, mentions) };
}

export async function listNotifications(client: unknown, userId: string) {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50)) as {
    data: NotificationRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Could not load notifications.");
  }

  return (data ?? []).map(mapNotification);
}

export async function markNotificationRead(
  client: unknown,
  input: {
    notificationId: string;
    userId: string;
    read: boolean;
  }
): Promise<MutationResult<DocumentNotification>> {
  const db = client as SupabaseLikeClient;
  const { data, error } = (await db
    .from("creed_notifications")
    .update({ read_at: input.read ? nowIso() : null })
    .eq("id", input.notificationId)
    .eq("user_id", input.userId)
    .select(NOTIFICATION_COLUMNS)
    .maybeSingle()) as {
    data: NotificationRow | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, code: "invalid", error: error.message };
  }
  if (!data) {
    return { ok: false, code: "not-found", error: "Notification not found." };
  }

  return { ok: true, value: mapNotification(data) };
}

async function markNotificationEmailStatus(
  client: unknown,
  input: {
    notificationId: string;
    status: "not-configured" | "sent" | "failed";
    error?: string | null;
  }
) {
  const db = client as SupabaseLikeClient;
  const { error } = (await db
    .from("creed_notifications")
    .update({
      email_status: input.status,
      email_error: input.error ?? null,
      email_attempted_at: nowIso(),
    })
    .eq("id", input.notificationId)) as {
    data: unknown;
    error: { message: string } | null;
  };

  if (error) {
    log.warn("notification_email_status_write_failed", { notificationId: input.notificationId }, error);
  }
}

export async function deliverPendingMentionEmails(
  client: unknown,
  pendingEmails: PendingEmailNotification[]
) {
  await Promise.all(
    pendingEmails.map(async (pending) => {
      const result = await sendMentionNotificationEmail({
        to: pending.to,
        actorLabel: pending.actorLabel,
        documentTitle: pending.documentTitle,
        commentBody: pending.commentBody,
        href: pending.href,
      });
      await markNotificationEmailStatus(client, {
        notificationId: pending.notificationId,
        status: result.status,
        error: result.status === "failed" || result.status === "not-configured" ? result.error : null,
      });
    })
  );
}

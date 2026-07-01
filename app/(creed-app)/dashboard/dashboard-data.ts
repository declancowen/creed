import "server-only";
import type { DocumentDashboardPreferences } from "@/lib/document-properties";
import {
  listSharedDocumentFolders,
  listSharedDocuments,
  readDocumentDashboardPreferences,
  type SharedDocumentFolder,
  type SharedDocumentSummary,
} from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type AdminClient = ReturnType<typeof getSupabaseAdminClient>;

export type DashboardData = {
  documents: SharedDocumentSummary[];
  folders: SharedDocumentFolder[];
  allFolders: SharedDocumentFolder[];
  currentFolder: SharedDocumentFolder | null;
  breadcrumbs: SharedDocumentFolder[];
  preferences: DocumentDashboardPreferences;
};

// Loads everything the dashboard needs, scoped to a folder when a slug is
// given. The root dashboard (no slug) shows top-level documents and folders;
// a folder view shows that folder's direct children. `allFolders` is passed
// through untouched so the create dialog can offer the full folder tree.
export async function loadDashboardData(
  supabase: ServerClient,
  admin: AdminClient,
  userId: string,
  folderSlug?: string | null
): Promise<DashboardData | { notFound: true }> {
  const [documents, allFolders, preferences] = await Promise.all([
    listSharedDocuments(supabase),
    listSharedDocumentFolders(supabase),
    readDocumentDashboardPreferences(admin, userId),
  ]);

  let currentFolder: SharedDocumentFolder | null = null;
  if (folderSlug) {
    currentFolder = allFolders.find((folder) => folder.slug === folderSlug) ?? null;
    if (!currentFolder) {
      return { notFound: true };
    }
  }

  const currentFolderId = currentFolder?.id ?? null;
  const scopedDocuments = documents.filter(
    (document) => (document.folderId ?? null) === currentFolderId
  );
  const childFolders = allFolders.filter(
    (folder) => (folder.parentId ?? null) === currentFolderId
  );

  const byId = new Map(allFolders.map((folder) => [folder.id, folder]));
  const breadcrumbs: SharedDocumentFolder[] = [];
  let cursor: SharedDocumentFolder | null = currentFolder;
  while (cursor) {
    breadcrumbs.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) ?? null : null;
  }

  return {
    documents: scopedDocuments,
    folders: childFolders,
    allFolders,
    currentFolder,
    breadcrumbs,
    preferences: preferences.effective,
  };
}

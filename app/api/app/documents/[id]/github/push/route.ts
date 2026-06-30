import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getGitHubFileSnapshot, pushGitHubFile } from "@/lib/github";
import { withAuthenticatedGitHubAccess } from "@/lib/github-version-control";
import { recordDocumentActivity } from "@/lib/document-collaboration";
import { markSharedDocumentSynced, readSharedDocumentById } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const payload = await withAuthenticatedGitHubAccess(async ({ user, integration }) => {
      const admin = getSupabaseAdminClient();
      const document = await readSharedDocumentById(admin, id);
      if (!document) {
        throw new Error("Document not found.");
      }
      if (!document.githubRepoOwner || !document.githubRepoName || !document.githubBranch || !document.githubPath) {
        throw new Error("Document is not mapped to GitHub yet.");
      }

      const remoteFile = await getGitHubFileSnapshot(
        integration.access_token!,
        document.githubRepoOwner,
        document.githubRepoName,
        document.githubPath,
        document.githubBranch
      );

      const remoteChangedSinceLastSync =
        Boolean(document.lastRemoteSha && remoteFile?.sha && remoteFile.sha !== document.lastRemoteSha);
      const localChangedSinceLastSync =
        document.lastSyncedRevision !== null && document.revision !== document.lastSyncedRevision;

      if (remoteChangedSinceLastSync && localChangedSinceLastSync) {
        throw new Error(
          "GitHub changed since the last sync and this document also changed in Supabase. Pull/review the remote change before publishing."
        );
      }

      const pushResult = await pushGitHubFile({
        accessToken: integration.access_token!,
        owner: document.githubRepoOwner,
        repo: document.githubRepoName,
        branch: document.githubBranch,
        path: document.githubPath,
        message: `Update ${document.path}`,
        content: document.content,
        currentSha: remoteFile?.sha ?? null,
      });

      const synced = await markSharedDocumentSynced(admin, {
        id: document.id,
        remoteSha: pushResult.sha,
        remoteMessage: pushResult.message,
        content: document.content,
        revision: document.revision,
        actorUserId: user.id,
      });

      if (!synced.ok) {
        throw new Error(synced.error);
      }

      await recordDocumentActivity(admin, {
        documentId: document.id,
        actorUserId: user.id,
        action: "document.github.published",
        summary: "Published document to GitHub",
        metadata: {
          repo: `${document.githubRepoOwner}/${document.githubRepoName}`,
          branch: document.githubBranch,
          path: document.githubPath,
          remoteSha: pushResult.sha,
        },
      });

      return {
        ok: true,
        document: synced.value,
        remoteSha: pushResult.sha,
        remoteMessage: pushResult.message,
        remoteCommittedAt: pushResult.committedAt,
      };
    }, auth);

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not publish document to GitHub.";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : /changed since the last sync/i.test(message) ? 409 : 400 }
    );
  }
}

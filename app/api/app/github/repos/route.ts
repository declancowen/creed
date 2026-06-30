import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { listGitHubRepos } from "@/lib/github";
import { withAuthenticatedGitHubAccess } from "@/lib/github-version-control";

export async function GET() {
  try {
    const auth = await requireApiAuth();
    if (auth instanceof NextResponse) return auth;

    const repos = await withAuthenticatedGitHubAccess(
      async ({ integration }) => listGitHubRepos(integration.access_token!),
      auth
    );

    return NextResponse.json({
      repos: repos.map((repo) => ({
        id: repo.id,
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch,
        private: repo.private,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load GitHub repos.";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 400 }
    );
  }
}

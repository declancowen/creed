import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { removeMcpClient } from "@/lib/creed-backend";
import { recordAuditEvent } from "@/lib/audit-log";
import { log } from "@/lib/observability";

// Removes a connected MCP agent associated with the signed-in user: revokes its
// OAuth grants and clears its roster + health rollups. The oauth_* tables are
// service-role only, so the removal runs through the admin client, scoped to the
// authenticated user's id.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const { clientId } = await params;
  const normalized = clientId?.trim();
  if (!normalized) {
    return NextResponse.json({ error: "Missing client id." }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdminClient();
    const { revokedTokens } = await removeMcpClient(admin, auth.user.id, normalized);

    await recordAuditEvent({
      userId: auth.user.id,
      action: "mcp.client.removed",
      request,
      metadata: { clientId: normalized, revokedTokens },
    });

    return NextResponse.json({ ok: true, revokedTokens });
  } catch (error) {
    log.error("mcp_client_remove_failed", { userId: auth.user.id, clientId: normalized }, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not remove MCP agent." },
      { status: 500 }
    );
  }
}

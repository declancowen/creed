import "server-only";

// Self-hosted Creed does not enforce paid entitlements. Keep this narrow
// server-only shim so legacy authorize routes can keep their contract without
// retaining payment SDKs, webhooks, billing state, or top-ups.
export async function hasActiveEntitlement(
  _client: unknown,
  _userId: string
): Promise<boolean> {
  return true;
}

import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthReactAdapter } from "@neondatabase/neon-js/auth/react/adapters";

const authUrl = (import.meta.env["VITE_NEON_AUTH_URL"] as string | undefined)?.trim() ?? "";

/** True when VITE_NEON_AUTH_URL is set. */
export function isNeonConfigured(): boolean {
  return Boolean(authUrl);
}

/**
 * Neon Managed Better Auth client (Better Auth under the hood).
 * Admin APIs (`admin.createUser`, etc.) require the signed-in user to have
 * the Neon Auth "admin" role — set via Neon Console → Auth → Users → Make admin.
 */
export const authClient = createAuthClient(authUrl || "http://localhost/auth-not-configured", {
  adapter: BetterAuthReactAdapter(),
});

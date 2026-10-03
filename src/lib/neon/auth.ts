import { createClient } from "@neondatabase/neon-js";
import { BetterAuthReactAdapter } from "@neondatabase/neon-js/auth/react/adapters";

const authUrl = (import.meta.env["VITE_NEON_AUTH_URL"] as string | undefined)?.trim() ?? "";

/**
 * Derive Data API URL from Neon Auth URL when VITE_NEON_DATA_API_URL is unset.
 * …neonauth…/dbname/auth → …apirest…/dbname/rest/v1
 */
export function deriveDataApiUrl(fromAuthUrl: string): string {
  const u = new URL(fromAuthUrl);
  if (!u.hostname.includes(".neonauth.")) {
    throw new Error("Cannot derive Data API URL: Auth URL host must contain .neonauth.");
  }
  const host = u.hostname.replace(".neonauth.", ".apirest.");
  const basePath = u.pathname.replace(/\/?auth\/?$/, "");
  return `${u.protocol}//${host}${basePath}/rest/v1`;
}

function resolveDataApiUrl(): string {
  const explicit = (import.meta.env["VITE_NEON_DATA_API_URL"] as string | undefined)?.trim();
  if (explicit) return explicit;
  if (!authUrl) return "";
  try {
    return deriveDataApiUrl(authUrl);
  } catch {
    return "";
  }
}

const dataApiUrl = resolveDataApiUrl();

/** True when VITE_NEON_AUTH_URL is set. */
export function isNeonConfigured(): boolean {
  return Boolean(authUrl);
}

/** True when Auth + Data API URLs are available for syncing app data. */
export function isNeonDataConfigured(): boolean {
  return Boolean(authUrl && dataApiUrl);
}

const authPlaceholder = "http://localhost/auth-not-configured";
const dataPlaceholder = "http://localhost/data-not-configured/rest/v1";

/**
 * Unified Neon client: Managed Better Auth + Data API (PostgREST).
 * Admin APIs require Neon Console → Auth → Users → Make admin.
 */
export const neon = createClient({
  auth: {
    url: authUrl || authPlaceholder,
    adapter: BetterAuthReactAdapter(),
  },
  dataApi: {
    url: dataApiUrl || dataPlaceholder,
  },
});

/** Better Auth surface (signIn, admin, getSession, …). */
export const authClient = neon.auth;

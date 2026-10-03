import { authClient, isNeonConfigured } from "./auth";

export type NeonAuthUser = {
  id: string;
  email: string;
  name: string;
};

export type NeonSession = {
  user: NeonAuthUser;
};

type AuthResult<T> = { ok: true; data: T } | { ok: false; error: string };

function mapError(error: unknown, fallback: string): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const e = error as { message?: string; statusText?: string };
    if (e.message) return e.message;
    if (e.statusText) return e.statusText;
  }
  return fallback;
}

export function requireNeonConfigured(): AuthResult<true> {
  if (!isNeonConfigured()) {
    return {
      ok: false,
      error: "Neon Auth is not configured. Set VITE_NEON_AUTH_URL in your .env file.",
    };
  }
  return { ok: true, data: true };
}

export async function getNeonSession(): Promise<NeonSession | null> {
  if (!isNeonConfigured()) return null;
  try {
    const result = await authClient.getSession();
    const user = result.data?.user;
    if (!user?.id || !user.email) return null;
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name || user.email.split("@")[0] || "User",
      },
    };
  } catch {
    return null;
  }
}

export async function neonSignIn(
  email: string,
  password: string,
  rememberMe = true,
): Promise<AuthResult<NeonAuthUser>> {
  const cfg = requireNeonConfigured();
  if (!cfg.ok) return cfg;

  const result = await authClient.signIn.email({
    email: email.trim(),
    password,
    rememberMe,
  });

  if (result.error) {
    return { ok: false, error: mapError(result.error, "Sign in failed.") };
  }

  const session = await getNeonSession();
  if (!session) {
    return { ok: false, error: "Signed in but session could not be loaded." };
  }
  return { ok: true, data: session.user };
}

export async function neonSignUp(input: {
  email: string;
  password: string;
  name: string;
}): Promise<AuthResult<NeonAuthUser>> {
  const cfg = requireNeonConfigured();
  if (!cfg.ok) return cfg;

  const result = await authClient.signUp.email({
    email: input.email.trim(),
    password: input.password,
    name: input.name.trim(),
  });

  if (result.error) {
    return { ok: false, error: mapError(result.error, "Sign up failed.") };
  }

  const session = await getNeonSession();
  if (!session) {
    // Some projects require email verification before a session exists.
    return {
      ok: false,
      error:
        "Account created, but no active session. Check your email to verify, then sign in.",
    };
  }
  return { ok: true, data: session.user };
}

export async function neonSignOut(): Promise<void> {
  if (!isNeonConfigured()) return;
  try {
    await authClient.signOut();
  } catch {
    // Local logout still proceeds.
  }
}

/**
 * Creates a user with email/password via Neon Admin API.
 * Caller must be a Neon Auth admin (Console → Make admin).
 */
export async function neonAdminCreateUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<AuthResult<NeonAuthUser>> {
  const cfg = requireNeonConfigured();
  if (!cfg.ok) return cfg;

  const result = await authClient.admin.createUser({
    email: input.email.trim(),
    password: input.password,
    name: input.name.trim(),
    role: "user",
  });

  if (result.error) {
    const msg = mapError(result.error, "Failed to create user in Neon Auth.");
    const needsAdmin =
      /admin|forbidden|unauthorized|permission|not allowed/i.test(msg) ||
      (typeof result.error === "object" &&
        result.error !== null &&
        "status" in result.error &&
        (result.error as { status?: number }).status === 403);
    return {
      ok: false,
      error: needsAdmin
        ? `${msg} Tip: in Neon Console → Auth → Users, set your account to Make admin so you can create staff logins.`
        : msg,
    };
  }

  const user = result.data?.user;
  if (!user?.id || !user.email) {
    return { ok: false, error: "User created but Neon returned no user id." };
  }

  return {
    ok: true,
    data: {
      id: user.id,
      email: user.email,
      name: user.name || input.name.trim(),
    },
  };
}

export async function neonAdminSetPassword(
  authUserId: string,
  newPassword: string,
): Promise<AuthResult<true>> {
  const cfg = requireNeonConfigured();
  if (!cfg.ok) return cfg;

  const result = await authClient.admin.setUserPassword({
    userId: authUserId,
    newPassword,
  });

  if (result.error) {
    return { ok: false, error: mapError(result.error, "Failed to update password.") };
  }
  return { ok: true, data: true };
}

export async function neonChangePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AuthResult<true>> {
  const cfg = requireNeonConfigured();
  if (!cfg.ok) return cfg;

  const result = await authClient.changePassword({
    currentPassword,
    newPassword,
    revokeOtherSessions: false,
  });

  if (result.error) {
    return { ok: false, error: mapError(result.error, "Failed to change password.") };
  }
  return { ok: true, data: true };
}

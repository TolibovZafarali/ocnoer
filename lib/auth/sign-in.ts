import { getRoleHomePath, type Role } from "@/lib/auth/roles";

export type AutoDetectSignInResult =
  | {
      ok: true;
      role: Role;
      redirectPath: "/admin" | "/play";
      account: "admin" | "player";
    }
  | {
      ok: false;
      reason: "invalid_credentials" | "missing_role";
    };

type AccountKey = "admin" | "player";

type RoleSignInFn = (input: {
  email: string;
  password: string;
  account: AccountKey;
}) => Promise<{ ok: boolean; role: Role | null }>;

export async function signInWithAutoDetectPassword(input: {
  adminEmail: string;
  playerEmail: string;
  password: string;
  signIn: RoleSignInFn;
}): Promise<AutoDetectSignInResult> {
  const attempts: Array<{ account: AccountKey; email: string }> = [
    { account: "admin", email: input.adminEmail },
    { account: "player", email: input.playerEmail }
  ];

  for (const attempt of attempts) {
    const result = await input.signIn({
      email: attempt.email,
      password: input.password,
      account: attempt.account
    });

    if (!result.ok) {
      continue;
    }

    if (!result.role) {
      return { ok: false, reason: "missing_role" };
    }

    return {
      ok: true,
      role: result.role,
      redirectPath: getRoleHomePath(result.role),
      account: attempt.account
    };
  }

  return { ok: false, reason: "invalid_credentials" };
}

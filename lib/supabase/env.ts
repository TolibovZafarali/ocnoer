type SupabaseEnvVar =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY";

type SupabaseServerEnvVar =
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "SUPABASE_RUNTIME_BUCKET";

function readEnvVar(name: SupabaseEnvVar): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseEnv() {
  return {
    url: readEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: readEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  };
}

function readServerEnvVar(name: SupabaseServerEnvVar): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseServerEnv() {
  return {
    serviceRoleKey: readServerEnvVar("SUPABASE_SERVICE_ROLE_KEY"),
    runtimeBucket: readServerEnvVar("SUPABASE_RUNTIME_BUCKET")
  };
}

export function getRoleLoginEmails() {
  const adminEmail = process.env.ADMIN_LOGIN_EMAIL;
  const playerEmail = process.env.PLAYER_LOGIN_EMAIL;

  if (!adminEmail) {
    throw new Error("Missing required environment variable: ADMIN_LOGIN_EMAIL");
  }

  if (!playerEmail) {
    throw new Error("Missing required environment variable: PLAYER_LOGIN_EMAIL");
  }

  return { adminEmail, playerEmail };
}

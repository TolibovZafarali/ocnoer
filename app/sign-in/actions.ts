"use server";

import { redirect } from "next/navigation";

import { signInWithAutoDetectPassword } from "@/lib/auth/sign-in";
import { getRoleFromAppMetadata } from "@/lib/auth/roles";
import { getRoleLoginEmails } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SignInFormState = {
  error: string | null;
};

export async function signInWithPasswordOnly(
  _prevState: SignInFormState,
  formData: FormData
): Promise<SignInFormState> {
  const passwordValue = formData.get("password");

  if (typeof passwordValue !== "string" || passwordValue.trim().length === 0) {
    return { error: "Enter your password to continue." };
  }

  const password = passwordValue.trim();
  const supabase = await createServerSupabaseClient();
  const { adminEmail, playerEmail } = getRoleLoginEmails();

  const result = await signInWithAutoDetectPassword({
    adminEmail,
    playerEmail,
    password,
    signIn: async ({ email, password: loginPassword }) => {
      const authResult = await supabase.auth.signInWithPassword({
        email,
        password: loginPassword
      });

      if (authResult.error || !authResult.data.user) {
        return {
          ok: false,
          role: null
        };
      }

      return {
        ok: true,
        role: getRoleFromAppMetadata(authResult.data.user)
      };
    }
  });

  if (!result.ok) {
    await supabase.auth.signOut();

    if (result.reason === "missing_role") {
      return {
        error: "Access is not configured for this account. Contact admin setup."
      };
    }

    return {
      error: "Invalid credentials. Please try again."
    };
  }

  redirect(result.redirectPath);
}

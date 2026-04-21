"use server";

import { redirect } from "next/navigation";

import { clearPlayerSession, signInAsPlayerSecret } from "@/lib/auth/player";

export type PlayerHomeGateState = {
  errorCount: number;
};

export async function signInHomePlayerAction(
  previousState: PlayerHomeGateState,
  formData: FormData
): Promise<PlayerHomeGateState> {
  const passwordValue = formData.get("password");

  if (typeof passwordValue !== "string" || passwordValue.trim().length === 0) {
    return {
      errorCount: previousState.errorCount + 1
    };
  }

  let result: Awaited<ReturnType<typeof signInAsPlayerSecret>>;

  try {
    result = await signInAsPlayerSecret(passwordValue.trim());
  } catch (error) {
    console.error("Home player sign-in failed.", error);

    return {
      errorCount: previousState.errorCount + 1
    };
  }

  if (!result.ok) {
    return {
      errorCount: previousState.errorCount + 1
    };
  }

  redirect("/play");
}

export async function signOutPlayerAction() {
  await clearPlayerSession();
  redirect("/");
}

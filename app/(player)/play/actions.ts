"use server";

import { redirect } from "next/navigation";

import { clearPlayerSession, signInAsPlayerSecret } from "@/lib/auth/player";

function withStatus(kind: "success" | "error", message: string) {
  const url = new URL("/play", "https://ocnoer.local");

  url.searchParams.set("status", kind);
  url.searchParams.set("message", message);

  return `${url.pathname}${url.search}`;
}

export async function signInPlayerAction(formData: FormData) {
  const passwordValue = formData.get("password");

  if (typeof passwordValue !== "string" || passwordValue.trim().length === 0) {
    redirect(withStatus("error", "Enter your password."));
  }

  let result: Awaited<ReturnType<typeof signInAsPlayerSecret>>;

  try {
    result = await signInAsPlayerSecret(passwordValue.trim());
  } catch (error) {
    console.error("Player sign-in failed.", error);
    redirect(
      withStatus("error", "Unable to sign in right now. Please try again.")
    );
  }

  if (!result.ok) {
    redirect(withStatus("error", "Password is invalid or access is inactive."));
  }

  redirect("/play");
}

export async function signOutPlayerAction() {
  await clearPlayerSession();
  redirect(withStatus("success", "Signed out."));
}

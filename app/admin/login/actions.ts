"use server";

import { redirect } from "next/navigation";

import { getAdminPasswordConfigError, signInAsAdmin } from "@/lib/auth/admin";

export type AdminLoginFormState = {
  error: string | null;
};

export async function loginAdminAction(
  _previousState: AdminLoginFormState,
  formData: FormData
): Promise<AdminLoginFormState> {
  const configError = getAdminPasswordConfigError();

  if (configError) {
    return {
      error: configError
    };
  }

  const passwordValue = formData.get("password");

  if (typeof passwordValue !== "string" || passwordValue.trim().length === 0) {
    return {
      error: "Enter the admin password."
    };
  }

  const result = await signInAsAdmin(passwordValue.trim());

  if (!result.ok) {
    return {
      error:
        result.reason === "missing_password_config"
          ? "ADMIN_PASSWORD is not configured. Add it to .env.local and restart the server."
          : "Password is invalid."
    };
  }

  redirect("/admin/chapters");
}

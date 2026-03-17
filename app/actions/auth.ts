"use server";

import { redirect } from "next/navigation";

import { clearAdminSession } from "@/lib/auth/admin";

export async function signOutAction() {
  await clearAdminSession();
  redirect("/admin/login");
}

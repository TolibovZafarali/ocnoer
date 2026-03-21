"use client";

import { useEffect } from "react";

import {
  AdminPageShell,
  Notice,
  PageHeader,
  SectionCard
} from "@/components/admin/forms";
import { Button } from "@/components/ui/button";

type AdminErrorPageProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

function getAdminErrorMessage(error: Error) {
  if (/fetch failed/i.test(error.message)) {
    return "Unable to reach Supabase storage right now. Check your Supabase URL, network connection, and project availability, then try again.";
  }

  return error.message || "Unable to load the admin data right now.";
}

export default function AdminErrorPage({
  error,
  reset
}: AdminErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title="Admin Unavailable"
          description="The admin view could not load its authoring data."
        />

        <Notice kind="error">{getAdminErrorMessage(error)}</Notice>

        <SectionCard
          title="Try Again"
          description="If the problem persists, verify the local environment variables and whether Supabase storage is reachable from this machine."
        >
          <div className="flex justify-end">
            <Button type="button" onClick={reset}>
              Retry
            </Button>
          </div>
        </SectionCard>
      </div>
    </AdminPageShell>
  );
}

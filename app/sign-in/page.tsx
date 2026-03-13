import { redirect } from "next/navigation";

import { SignInForm } from "@/app/sign-in/sign-in-form";
import { getRoleHomePath } from "@/lib/auth/roles";
import { getSessionRole } from "@/lib/auth/session";

type SignInPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getInitialErrorFromQuery(errorParam: string | string[] | undefined) {
  const value = Array.isArray(errorParam) ? errorParam[0] : errorParam;

  if (!value) {
    return null;
  }

  if (value === "role_config") {
    return "Your role is not configured. Please contact the app administrator.";
  }

  return "Unable to sign in with current access settings.";
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await getSessionRole();

  if (session.isAuthenticated && session.role) {
    redirect(getRoleHomePath(session.role));
  }

  const params = await searchParams;
  const initialError = getInitialErrorFromQuery(params.error);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter your password. The app will identify the correct account automatically.
        </p>
        <div className="mt-6">
          <SignInForm initialError={initialError} />
        </div>
      </div>
    </main>
  );
}

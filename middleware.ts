import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { decideRouteAccess } from "@/lib/auth/route-access";
import { getExpectedRoleForPath, getRoleFromAppMetadata } from "@/lib/auth/roles";
import { getSupabaseEnv } from "@/lib/supabase/env";

function buildSignInUrl(request: NextRequest, reason?: "role_config") {
  const url = request.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = "";

  if (reason) {
    url.searchParams.set("error", reason);
  }

  return url;
}

export async function middleware(request: NextRequest) {
  const requiredRole = getExpectedRoleForPath(request.nextUrl.pathname);

  if (!requiredRole) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request
  });

  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  const { data } = await supabase.auth.getUser();
  const isAuthenticated = Boolean(data.user);
  const role = data.user ? getRoleFromAppMetadata(data.user) : null;

  const decision = decideRouteAccess({
    requiredRole,
    isAuthenticated,
    role
  });

  if (decision.type === "allow") {
    return response;
  }

  if (decision.type === "redirect_to_role_home") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = decision.to;
    redirectUrl.search = "";

    return NextResponse.redirect(redirectUrl);
  }

  if (decision.reason === "role_config") {
    await supabase.auth.signOut();
    return NextResponse.redirect(buildSignInUrl(request, "role_config"));
  }

  return NextResponse.redirect(buildSignInUrl(request));
}

export const config = {
  matcher: ["/admin/:path*", "/play/:path*"]
};

import { NextResponse } from "next/server";

import { requirePlayerApiSession } from "@/lib/auth/player-api";

async function recordActivity(request: Request) {
  const session = await requirePlayerApiSession(request);

  if (!session.ok) {
    return session.response;
  }

  return NextResponse.json({
    ok: true
  });
}

export async function GET(request: Request) {
  return recordActivity(request);
}

export async function POST(request: Request) {
  return recordActivity(request);
}

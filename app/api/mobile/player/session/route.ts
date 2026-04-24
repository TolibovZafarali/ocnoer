import { NextResponse } from "next/server";

import { authenticatePlayerSecret } from "@/lib/auth/player-session";
import {
  createMobilePlayerSessionResponse,
  requireMobilePlayerSession
} from "@/lib/auth/mobile-player-api";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    secret?: unknown;
    password?: unknown;
  } | null;
  const secret =
    typeof body?.secret === "string"
      ? body.secret
      : typeof body?.password === "string"
        ? body.password
        : "";

  if (secret.trim().length === 0) {
    return NextResponse.json(
      { error: "Player access credential is required." },
      { status: 400 }
    );
  }

  const result = await authenticatePlayerSecret(secret);

  if (!result.ok) {
    return NextResponse.json(
      { error: "Invalid player access." },
      { status: 401 }
    );
  }

  return NextResponse.json(createMobilePlayerSessionResponse(result.player));
}

export async function GET(request: Request) {
  const session = await requireMobilePlayerSession(request);

  if (!session.ok) {
    return session.response;
  }

  return NextResponse.json({
    session: {
      token: session.token,
      expiresAt: session.expiresAt
    },
    player: session.player
  });
}

export async function DELETE() {
  return NextResponse.json({
    ok: true
  });
}

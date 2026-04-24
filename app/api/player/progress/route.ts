import { NextResponse } from "next/server";

import { requirePlayerApiSession } from "@/lib/auth/player-api";
import {
  clearPlayerProgress,
  getPlayerProgress,
  parsePlayerProgressRequestPayload,
  PlayerProgressError,
  savePlayerProgress
} from "@/lib/player-progress";

function toValidationResponse(error: unknown) {
  if (error instanceof PlayerProgressError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error("Player progress API failed.", error);
  return NextResponse.json(
    { error: "Unable to sync player progress right now." },
    { status: 500 }
  );
}

async function saveProgress(request: Request) {
  const session = await requirePlayerApiSession(request);

  if (!session.ok) {
    return session.response;
  }

  const body = (await request.json().catch(() => null)) as unknown;

  try {
    const progress = parsePlayerProgressRequestPayload(body);
    const result = await savePlayerProgress({
      playerId: session.player.id,
      progress
    });

    return NextResponse.json(result);
  } catch (error) {
    return toValidationResponse(error);
  }
}

export async function GET(request: Request) {
  const session = await requirePlayerApiSession(request);

  if (!session.ok) {
    return session.response;
  }

  try {
    const progress = await getPlayerProgress(session.player.id);

    return NextResponse.json({
      progress
    });
  } catch (error) {
    return toValidationResponse(error);
  }
}

export async function PUT(request: Request) {
  return saveProgress(request);
}

export async function POST(request: Request) {
  return saveProgress(request);
}

export async function DELETE(request: Request) {
  const session = await requirePlayerApiSession(request);

  if (!session.ok) {
    return session.response;
  }

  try {
    await clearPlayerProgress(session.player.id);

    return NextResponse.json({
      progress: null,
      cleared: true
    });
  } catch (error) {
    return toValidationResponse(error);
  }
}

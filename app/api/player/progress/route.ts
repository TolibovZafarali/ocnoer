import { NextResponse } from "next/server";

import { getSessionRole } from "@/lib/auth/session";
import {
  PUBLISHED_RUNTIME_SCHEMA_UNAVAILABLE_MESSAGE,
  resolveOrUpsertPlayerUserByEmail,
  StoryRepositoryError,
  upsertReadingProgress
} from "@/lib/story/repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function getRequiredString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

export async function POST(request: Request) {
  const session = await getSessionRole();

  if (!session.isAuthenticated) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (session.role !== "player") {
    return NextResponse.json({ error: "Player access required." }, { status: 403 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const publishedVersionId = getRequiredString(body.publishedVersionId);
  const chapterPublicId = getRequiredString(body.chapterPublicId);
  const scenePublicId = getRequiredString(body.scenePublicId);
  const dialogueEntryPublicId = getRequiredString(body.dialogueEntryPublicId);
  const lastReadAt = getRequiredString(body.lastReadAt);

  if (
    !publishedVersionId ||
    !chapterPublicId ||
    !scenePublicId ||
    !dialogueEntryPublicId ||
    !lastReadAt
  ) {
    return NextResponse.json(
      {
        error: "Published version id, chapter, scene, entry, and timestamp are required."
      },
      { status: 400 }
    );
  }

  const parsedLastReadAt = new Date(lastReadAt);

  if (Number.isNaN(parsedLastReadAt.getTime())) {
    return NextResponse.json(
      {
        error: "Last read timestamp is invalid."
      },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const userEmail = data.user?.email;

  if (!userEmail) {
    return NextResponse.json(
      {
        error: "Unable to resolve the signed-in player."
      },
      { status: 401 }
    );
  }

  try {
    const user = await resolveOrUpsertPlayerUserByEmail(userEmail);

    await upsertReadingProgress({
      userId: user.id,
      publishedVersionId,
      chapterPublicId,
      scenePublicId,
      dialogueEntryPublicId,
      lastReadAt: parsedLastReadAt
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof StoryRepositoryError
        ? error.message
        : "Unable to persist reading progress.";
    const status =
      message === PUBLISHED_RUNTIME_SCHEMA_UNAVAILABLE_MESSAGE ? 503 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

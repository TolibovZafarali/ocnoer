"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  StoryRepositoryError,
  createPlayerPromptResponse
} from "@/lib/story/repository";

export type SubmitPlayerPromptResponseState = {
  status: "idle" | "error" | "success";
  message: string | null;
  dialogueEntryId: string | null;
};

export const initialSubmitPlayerPromptResponseState: SubmitPlayerPromptResponseState =
  {
    status: "idle",
    message: null,
    dialogueEntryId: null
  };

function getRequiredField(formData: FormData, key: string, label: string) {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

export async function submitPlayerPromptResponseAction(
  _prevState: SubmitPlayerPromptResponseState,
  formData: FormData
): Promise<SubmitPlayerPromptResponseState> {
  await requireRole("player");

  let dialogueEntryId = "";
  let sceneId = "";
  let chapterId = "";
  let responseText = "";

  try {
    dialogueEntryId = getRequiredField(
      formData,
      "dialogueEntryId",
      "Dialogue entry id"
    );
    sceneId = getRequiredField(formData, "sceneId", "Scene id");
    chapterId = getRequiredField(formData, "chapterId", "Chapter id");
    responseText = getRequiredField(formData, "responseText", "Response");
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Invalid response input.",
      dialogueEntryId: dialogueEntryId || null
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const userEmail = data.user?.email;

  if (!userEmail) {
    return {
      status: "error",
      message: "Unable to resolve your account email for response capture.",
      dialogueEntryId
    };
  }

  try {
    await createPlayerPromptResponse({
      dialogueEntryId,
      sceneId,
      chapterId,
      userEmail,
      responseText
    });

    revalidatePath("/admin");

    return {
      status: "success",
      message: "Response saved.",
      dialogueEntryId
    };
  } catch (error) {
    const message =
      error instanceof StoryRepositoryError
        ? error.message
        : "Unable to save your response right now.";

    return {
      status: "error",
      message,
      dialogueEntryId
    };
  }
}

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addCharacterEmotionAction,
  deleteCharacterAction,
  deleteCharacterEmotionAction,
  setDefaultCharacterEmotionAction,
  updateCharacterAction,
  updateCharacterEmotionAction
} from "@/app/(admin)/admin/actions";
import {
  AdminCard,
  AdminCardGrid,
  AdminEmptyState
} from "@/components/admin/cards";
import {
  AdminPageShell,
  Field,
  Notice,
  PageHeader,
  Pill,
  SectionCard,
  TextArea,
  TextInput
} from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { getAdminStoryData } from "@/lib/story/repository";
import { toPublicStorageUrl } from "@/lib/story/runtime";
import {
  PRIMARY_LEFT_STAGE_CHARACTER_SLUG,
  isPrimaryLeftStageCharacterSlug
} from "@/lib/story/staging";
import { getSupabaseEnv } from "@/lib/supabase/env";

type CharacterDetailPageProps = {
  params: Promise<{
    characterId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function countCharacterReferences(
  story: Awaited<ReturnType<typeof getAdminStoryData>>,
  characterId: string
) {
  return story.chapters.reduce(
    (totals, chapter) => {
      chapter.scenes.forEach((scene) => {
        if (scene.characterIds.includes(characterId)) {
          totals.sceneCastCount += 1;
        }

        scene.dialogue.forEach((entry) => {
          if (
            entry.speaker.type === "character" &&
            entry.speaker.characterId === characterId
          ) {
            totals.dialogueCount += 1;
          }
        });
      });

      return totals;
    },
    { sceneCastCount: 0, dialogueCount: 0 }
  );
}

function countEmotionDialogueReferences(
  story: Awaited<ReturnType<typeof getAdminStoryData>>,
  input: { characterId: string; emotionKey: string }
) {
  return story.chapters.reduce((count, chapter) => {
    return (
      count +
      chapter.scenes.reduce((sceneCount, scene) => {
        return (
          sceneCount +
          scene.dialogue.filter(
            (entry) =>
              entry.speaker.type === "character" &&
              entry.speaker.characterId === input.characterId &&
              entry.speaker.emotionKey === input.emotionKey
          ).length
        );
      }, 0)
    );
  }, 0);
}

export default async function CharacterDetailPage({
  params,
  searchParams
}: CharacterDetailPageProps) {
  const [{ characterId }, story] = await Promise.all([
    params,
    getAdminStoryData()
  ]);
  const query: Record<string, string | string[] | undefined> = searchParams
    ? await searchParams
    : {};
  const { url: supabaseUrl } = getSupabaseEnv();
  const character =
    story.characters.find((item) => item.id === characterId) ?? null;

  if (!character) {
    notFound();
  }

  const status = getParam(query.status);
  const message = getParam(query.message);
  const returnTo = `/admin/characters/${character.id}`;
  const defaultEmotion =
    character.emotions.find(
      (emotion) => emotion.key === character.defaultEmotionKey
    ) ??
    character.emotions[0] ??
    null;
  const previewUrl = toPublicStorageUrl(
    supabaseUrl,
    defaultEmotion?.imagePath ?? null
  );
  const isSingleEmotion = character.emotions.length === 1;
  const { sceneCastCount, dialogueCount } = countCharacterReferences(
    story,
    character.id
  );
  const isCharacterDeleteBlocked = sceneCastCount > 0 || dialogueCount > 0;
  const isLeftStageAnchor = isPrimaryLeftStageCharacterSlug(character.slug);

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title={character.name}
          description="Manage the character profile and its emotion variants here while keeping the character index lightweight."
          actions={
            <Button asChild variant="outline">
              <Link href="/admin/characters">Back to Characters</Link>
            </Button>
          }
        />

        {status === "success" && message ? (
          <Notice kind="success">{message}</Notice>
        ) : null}
        {status === "error" && message ? (
          <Notice kind="error">{message}</Notice>
        ) : null}

        <SectionCard
          title="Character Settings"
          description="Edit the character name and bio here. The slug stays visible but is not the main editing surface."
        >
          <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={`${character.name} default emotion`}
                  className="aspect-[4/5] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[4/5] items-center justify-center text-sm text-slate-500">
                  No image
                </div>
              )}
            </div>

            <form action={updateCharacterAction} className="space-y-4">
              <input type="hidden" name="characterId" value={character.id} />
              <input type="hidden" name="slug" value={character.slug} />
              <input type="hidden" name="returnTo" value={returnTo} />

              <div className="flex flex-wrap gap-2">
                <Pill>{character.emotions.length} emotions</Pill>
                <Pill>Default: {character.defaultEmotionKey}</Pill>
                <Pill>{character.slug}</Pill>
                {isLeftStageAnchor ? (
                  <Pill tone="success">Left-stage anchor</Pill>
                ) : null}
              </div>

              {isLeftStageAnchor ? (
                <p className="text-sm text-slate-600">
                  The current player keeps this character on the left stage when
                  the slug remains{" "}
                  <span className="font-medium">
                    {PRIMARY_LEFT_STAGE_CHARACTER_SLUG}
                  </span>
                  .
                </p>
              ) : null}

              <Field label="Character Name" htmlFor="character-name">
                <TextInput
                  id="character-name"
                  name="name"
                  defaultValue={character.name}
                  required
                />
              </Field>

              <Field label="Bio" htmlFor="character-bio" hint="Optional.">
                <TextArea
                  id="character-bio"
                  name="bio"
                  defaultValue={character.bio ?? ""}
                />
              </Field>

              <div className="flex justify-end">
                <Button type="submit">Save Character</Button>
              </div>
            </form>
          </div>
        </SectionCard>

        <SectionCard
          title="Add Emotion"
          description="Add a new emotion image and label. Characters must always keep at least one emotion."
        >
          <form
            action={addCharacterEmotionAction}
            className="space-y-4"
          >
            <input type="hidden" name="characterId" value={character.id} />
            <input type="hidden" name="returnTo" value={returnTo} />

            <div className="grid gap-4 lg:grid-cols-3">
              <Field label="Emotion Key" htmlFor="emotion-key">
                <TextInput
                  id="emotion-key"
                  name="emotionKey"
                  placeholder="hopeful"
                  required
                />
              </Field>

              <Field label="Emotion Label" htmlFor="emotion-label">
                <TextInput
                  id="emotion-label"
                  name="emotionLabel"
                  placeholder="Hopeful"
                  required
                />
              </Field>

              <Field label="Emotion Image" htmlFor="emotion-image">
                <TextInput
                  id="emotion-image"
                  name="imageFile"
                  type="file"
                  accept="image/*"
                  required
                />
              </Field>
            </div>

            <div className="flex justify-end">
              <Button type="submit">Add Emotion</Button>
            </div>
          </form>
        </SectionCard>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-950">Emotions</h2>
            <p className="text-sm text-slate-600">
              Emotion cards show the image, label, key, and current default
              state. Default switching stays visible, while edit and delete
              actions live in a secondary panel on each card.
            </p>
          </div>

          {character.emotions.length === 0 ? (
            <AdminEmptyState
              title="No Emotions Yet"
              description="Add an emotion above to populate this character."
            />
          ) : (
            <AdminCardGrid className="xl:grid-cols-2">
              {character.emotions.map((emotion) => {
                const emotionUrl = toPublicStorageUrl(
                  supabaseUrl,
                  emotion.imagePath
                );
                const isDefault = emotion.key === character.defaultEmotionKey;
                const emotionDialogueReferenceCount =
                  countEmotionDialogueReferences(story, {
                    characterId: character.id,
                    emotionKey: emotion.key
                  });
                const isEmotionDeleteBlocked =
                  isSingleEmotion || emotionDialogueReferenceCount > 0;

                return (
                  <AdminCard
                    key={emotion.id}
                    title={emotion.label}
                    eyebrow={emotion.key}
                    media={
                      emotionUrl ? (
                        <img
                          src={emotionUrl}
                          alt={`${character.name} ${emotion.label}`}
                          className="aspect-[4/5] w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[4/5] items-center justify-center bg-slate-100 text-sm text-slate-500">
                          No image
                        </div>
                      )
                    }
                    description={
                      <div className="space-y-4">
                        <div className="space-y-3">
                          <p>
                            Emotion key:{" "}
                            <span className="font-medium text-slate-700">
                              {emotion.key}
                            </span>
                          </p>

                          {!isDefault ? (
                            <form action={setDefaultCharacterEmotionAction}>
                              <input
                                type="hidden"
                                name="characterId"
                                value={character.id}
                              />
                              <input
                                type="hidden"
                                name="emotionId"
                                value={emotion.id}
                              />
                              <input
                                type="hidden"
                                name="returnTo"
                                value={returnTo}
                              />
                              <Button type="submit" size="sm" variant="outline">
                                Set As Default
                              </Button>
                            </form>
                          ) : null}
                        </div>

                        <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <summary className="cursor-pointer text-sm font-medium text-slate-800">
                            Edit or delete emotion
                          </summary>

                          <div className="mt-3 space-y-4">
                            <form
                              action={updateCharacterEmotionAction}
                              className="space-y-3"
                            >
                              <input
                                type="hidden"
                                name="characterId"
                                value={character.id}
                              />
                              <input
                                type="hidden"
                                name="emotionId"
                                value={emotion.id}
                              />
                              <input
                                type="hidden"
                                name="returnTo"
                                value={returnTo}
                              />

                              <Field
                                label="Emotion Key"
                                htmlFor={`emotion-key-${emotion.id}`}
                              >
                                <TextInput
                                  id={`emotion-key-${emotion.id}`}
                                  name="emotionKey"
                                  defaultValue={emotion.key}
                                  required
                                />
                              </Field>

                              <Field
                                label="Emotion Label"
                                htmlFor={`emotion-label-${emotion.id}`}
                              >
                                <TextInput
                                  id={`emotion-label-${emotion.id}`}
                                  name="emotionLabel"
                                  defaultValue={emotion.label}
                                  required
                                />
                              </Field>

                              <Field
                                label="Replace Image"
                                htmlFor={`emotion-file-${emotion.id}`}
                                hint="Optional."
                              >
                                <TextInput
                                  id={`emotion-file-${emotion.id}`}
                                  name="imageFile"
                                  type="file"
                                  accept="image/*"
                                />
                              </Field>

                              <div className="flex justify-end">
                                <Button
                                  type="submit"
                                  size="sm"
                                  variant="outline"
                                >
                                  Save Emotion
                                </Button>
                              </div>
                            </form>

                            <div className="border-t border-slate-200 pt-4">
                              <p className="text-sm text-slate-600">
                                {isSingleEmotion
                                  ? "A character must always keep at least one emotion, so deletion is unavailable until another emotion exists."
                                  : emotionDialogueReferenceCount > 0
                                    ? `Delete is blocked while ${emotionDialogueReferenceCount} dialogue ${emotionDialogueReferenceCount === 1 ? "row" : "rows"} still use this emotion.`
                                    : isDefault
                                      ? "Deleting the default emotion will promote another remaining emotion automatically."
                                      : "Delete permanently removes this emotion image and label."}
                              </p>
                              <form
                                action={deleteCharacterEmotionAction}
                                className="mt-3 space-y-3"
                              >
                                <input
                                  type="hidden"
                                  name="characterId"
                                  value={character.id}
                                />
                                <input
                                  type="hidden"
                                  name="emotionId"
                                  value={emotion.id}
                                />
                                <input
                                  type="hidden"
                                  name="returnTo"
                                  value={returnTo}
                                />
                                {!isEmotionDeleteBlocked ? (
                                  <label className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                                    <input
                                      type="checkbox"
                                      name="confirmDelete"
                                      value="yes"
                                      required
                                      className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-700"
                                    />
                                    <span>
                                      I understand that deleting this emotion
                                      removes its image and label from the
                                      character.
                                    </span>
                                  </label>
                                ) : null}
                                <div className="flex justify-end">
                                  <Button
                                    type="submit"
                                    size="sm"
                                    variant="destructive"
                                    disabled={isEmotionDeleteBlocked}
                                  >
                                    Delete Emotion
                                  </Button>
                                </div>
                              </form>
                            </div>
                          </div>
                        </details>
                      </div>
                    }
                    footer={
                      <>
                        <Pill>{emotion.label}</Pill>
                        <Pill>{emotion.key}</Pill>
                        {isDefault ? <Pill>Default</Pill> : null}
                      </>
                    }
                  />
                );
              })}
            </AdminCardGrid>
          )}
        </section>

        <SectionCard
          title="Delete Character"
          description="Deleting a character is blocked while scenes or dialogue still reference that character."
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {isCharacterDeleteBlocked
                ? `Delete is blocked while this character is still used in ${sceneCastCount} ${sceneCastCount === 1 ? "scene cast" : "scene casts"} and ${dialogueCount} dialogue ${dialogueCount === 1 ? "row" : "rows"}.`
                : "Remove this character only when it is no longer needed in the story cast."}
            </p>
            <form action={deleteCharacterAction} className="space-y-4">
              <input type="hidden" name="characterId" value={character.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              {!isCharacterDeleteBlocked ? (
                <label className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  <input
                    type="checkbox"
                    name="confirmDelete"
                    value="yes"
                    required
                    className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-700"
                  />
                  <span>
                    I understand that deleting this character removes its
                    profile and all stored emotion images.
                  </span>
                </label>
              ) : null}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isCharacterDeleteBlocked}
                >
                  Delete Character
                </Button>
              </div>
            </form>
          </div>
        </SectionCard>
      </div>
    </AdminPageShell>
  );
}

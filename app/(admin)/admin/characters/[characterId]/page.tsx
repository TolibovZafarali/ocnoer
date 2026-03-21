/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addCharacterEmotionAction,
  createCharacterDressAction,
  deleteCharacterAction,
  deleteCharacterDressAction,
  deleteCharacterDressEmotionOverrideAction,
  deleteCharacterEmotionAction,
  setDefaultCharacterEmotionAction,
  updateCharacterAction,
  updateCharacterDressAction,
  upsertCharacterDressEmotionOverrideAction,
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
import { getDressPreviewImagePath } from "@/lib/story/wardrobe";
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
            (entry.speaker.type === "character" ||
              entry.speaker.type === "dress_prompt") &&
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

function countDressPromptReferences(
  story: Awaited<ReturnType<typeof getAdminStoryData>>,
  input: { characterId: string; dressKey: string }
) {
  return story.chapters.reduce((count, chapter) => {
    return (
      count +
      chapter.scenes.reduce((sceneCount, scene) => {
        return (
          sceneCount +
          scene.dialogue.filter(
            (entry) =>
              entry.speaker.type === "dress_prompt" &&
              entry.speaker.characterId === input.characterId &&
              entry.speaker.dressOptionKeys.includes(input.dressKey)
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
                <Pill>{character.dresses.length} dresses</Pill>
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

        {isLeftStageAnchor ? (
          <>
            <SectionCard
              title="Add Dress"
              description="Create a reusable dress variant for Ocnoer. Each dress can override any subset of Ocnoer’s emotion portraits."
            >
              <form action={createCharacterDressAction} className="space-y-4">
                <input type="hidden" name="characterId" value={character.id} />
                <input type="hidden" name="returnTo" value={returnTo} />

                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="Dress Key" htmlFor="dress-key">
                    <TextInput
                      id="dress-key"
                      name="dressKey"
                      placeholder="mourning"
                      required
                    />
                  </Field>

                  <Field label="Dress Label" htmlFor="dress-label">
                    <TextInput
                      id="dress-label"
                      name="dressLabel"
                      placeholder="Mourning Dress"
                      required
                    />
                  </Field>
                </div>

                <div className="flex justify-end">
                  <Button type="submit">Add Dress</Button>
                </div>
              </form>
            </SectionCard>

            <section className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-950">
                  Dresses
                </h2>
                <p className="text-sm text-slate-600">
                  Dress prompts currently apply only to Ocnoer. Each dress can
                  override whichever emotion images are needed for the next
                  scenes; any missing emotion falls back to the base character
                  image automatically.
                </p>
              </div>

              {character.dresses.length === 0 ? (
                <AdminEmptyState
                  title="No Dresses Yet"
                  description="Add a dress above before using wardrobe prompts in scenes."
                />
              ) : (
                <AdminCardGrid className="xl:grid-cols-2">
                  {character.dresses.map((dress) => {
                    const dressPreviewUrl = toPublicStorageUrl(
                      supabaseUrl,
                      getDressPreviewImagePath({
                        character,
                        dressKey: dress.key
                      })
                    );
                    const dressReferenceCount = countDressPromptReferences(
                      story,
                      {
                        characterId: character.id,
                        dressKey: dress.key
                      }
                    );
                    const isDressDeleteBlocked = dressReferenceCount > 0;

                    return (
                      <AdminCard
                        key={dress.id}
                        title={dress.label}
                        eyebrow={dress.key}
                        media={
                          dressPreviewUrl ? (
                            <img
                              src={dressPreviewUrl}
                              alt={`${character.name} ${dress.label}`}
                              className="aspect-[4/5] w-full object-cover"
                            />
                          ) : (
                            <div className="flex aspect-[4/5] items-center justify-center bg-slate-100 text-sm text-slate-500">
                              No preview
                            </div>
                          )
                        }
                        description={
                          <div className="space-y-4">
                            <p className="text-sm text-slate-600">
                              {dress.emotionOverrides.length === 0
                                ? "No overrides yet. Base emotion art will be used until overrides are uploaded."
                                : `${dress.emotionOverrides.length} emotion override${dress.emotionOverrides.length === 1 ? "" : "s"} configured.`}
                            </p>

                            <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <summary className="cursor-pointer text-sm font-medium text-slate-800">
                                Edit dress and manage overrides
                              </summary>

                              <div className="mt-3 space-y-4">
                                <form
                                  action={updateCharacterDressAction}
                                  className="space-y-3"
                                >
                                  <input
                                    type="hidden"
                                    name="characterId"
                                    value={character.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="dressId"
                                    value={dress.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="returnTo"
                                    value={returnTo}
                                  />

                                  <Field
                                    label="Dress Key"
                                    htmlFor={`dress-key-${dress.id}`}
                                  >
                                    <TextInput
                                      id={`dress-key-${dress.id}`}
                                      name="dressKey"
                                      defaultValue={dress.key}
                                      required
                                    />
                                  </Field>

                                  <Field
                                    label="Dress Label"
                                    htmlFor={`dress-label-${dress.id}`}
                                  >
                                    <TextInput
                                      id={`dress-label-${dress.id}`}
                                      name="dressLabel"
                                      defaultValue={dress.label}
                                      required
                                    />
                                  </Field>

                                  <div className="flex justify-end">
                                    <Button
                                      type="submit"
                                      size="sm"
                                      variant="outline"
                                    >
                                      Save Dress
                                    </Button>
                                  </div>
                                </form>

                                <div className="space-y-3 border-t border-slate-200 pt-4">
                                  <p className="text-sm text-slate-600">
                                    Upload one image per emotion only where the
                                    dress should override the base portrait.
                                  </p>

                                  <div className="space-y-4">
                                    {character.emotions.map((emotion) => {
                                      const override =
                                        dress.emotionOverrides.find(
                                          (item) =>
                                            item.emotionKey === emotion.key
                                        ) ?? null;
                                      const overrideUrl = toPublicStorageUrl(
                                        supabaseUrl,
                                        override?.imagePath ?? null
                                      );

                                      return (
                                        <div
                                          key={`${dress.id}:${emotion.key}`}
                                          className="rounded-xl border border-slate-200 bg-white p-3"
                                        >
                                          <div className="flex flex-wrap items-start gap-4">
                                            <div className="w-24 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                                              {overrideUrl ? (
                                                <img
                                                  src={overrideUrl}
                                                  alt={`${dress.label} ${emotion.label}`}
                                                  className="aspect-[4/5] w-full object-cover"
                                                />
                                              ) : (
                                                <div className="flex aspect-[4/5] items-center justify-center px-2 text-center text-xs text-slate-500">
                                                  Base image
                                                </div>
                                              )}
                                            </div>

                                            <div className="min-w-0 flex-1 space-y-3">
                                              <div>
                                                <p className="font-medium text-slate-800">
                                                  {emotion.label}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                  {emotion.key}
                                                </p>
                                              </div>

                                              <form
                                                action={
                                                  upsertCharacterDressEmotionOverrideAction
                                                }
                                                className="grid gap-3 lg:grid-cols-[1fr_auto]"
                                              >
                                                <input
                                                  type="hidden"
                                                  name="characterId"
                                                  value={character.id}
                                                />
                                                <input
                                                  type="hidden"
                                                  name="dressId"
                                                  value={dress.id}
                                                />
                                                <input
                                                  type="hidden"
                                                  name="emotionKey"
                                                  value={emotion.key}
                                                />
                                                <input
                                                  type="hidden"
                                                  name="returnTo"
                                                  value={returnTo}
                                                />
                                                <TextInput
                                                  name="imageFile"
                                                  type="file"
                                                  accept="image/*"
                                                  required
                                                />
                                                <Button
                                                  type="submit"
                                                  size="sm"
                                                  variant="outline"
                                                >
                                                  {override
                                                    ? "Replace Override"
                                                    : "Upload Override"}
                                                </Button>
                                              </form>

                                              {override ? (
                                                <form
                                                  action={
                                                    deleteCharacterDressEmotionOverrideAction
                                                  }
                                                  className="flex justify-end"
                                                >
                                                  <input
                                                    type="hidden"
                                                    name="characterId"
                                                    value={character.id}
                                                  />
                                                  <input
                                                    type="hidden"
                                                    name="dressId"
                                                    value={dress.id}
                                                  />
                                                  <input
                                                    type="hidden"
                                                    name="emotionKey"
                                                    value={emotion.key}
                                                  />
                                                  <input
                                                    type="hidden"
                                                    name="returnTo"
                                                    value={returnTo}
                                                  />
                                                  <Button
                                                    type="submit"
                                                    size="sm"
                                                    variant="destructive"
                                                  >
                                                    Remove Override
                                                  </Button>
                                                </form>
                                              ) : null}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                <div className="border-t border-slate-200 pt-4">
                                  <p className="text-sm text-slate-600">
                                    {isDressDeleteBlocked
                                      ? `Delete is blocked while ${dressReferenceCount} dress prompt ${dressReferenceCount === 1 ? "row still references" : "rows still reference"} this dress.`
                                      : "Delete permanently removes this dress and all of its uploaded override images."}
                                  </p>
                                  <form
                                    action={deleteCharacterDressAction}
                                    className="mt-3 space-y-3"
                                  >
                                    <input
                                      type="hidden"
                                      name="characterId"
                                      value={character.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="dressId"
                                      value={dress.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="returnTo"
                                      value={returnTo}
                                    />
                                    {!isDressDeleteBlocked ? (
                                      <label className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                                        <input
                                          type="checkbox"
                                          name="confirmDelete"
                                          value="yes"
                                          required
                                          className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-700"
                                        />
                                        <span>
                                          I understand that deleting this dress
                                          removes all of its override images.
                                        </span>
                                      </label>
                                    ) : null}
                                    <div className="flex justify-end">
                                      <Button
                                        type="submit"
                                        size="sm"
                                        variant="destructive"
                                        disabled={isDressDeleteBlocked}
                                      >
                                        Delete Dress
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
                            <Pill>{dress.label}</Pill>
                            <Pill>{dress.key}</Pill>
                            <Pill>
                              {dress.emotionOverrides.length} overrides
                            </Pill>
                          </>
                        }
                      />
                    );
                  })}
                </AdminCardGrid>
              )}
            </section>
          </>
        ) : null}

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

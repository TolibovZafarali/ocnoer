/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  createDialogueEntryAction,
  deleteDialogueEntryAction,
  deleteSceneAction,
  updateDialogueEntryAction,
  updateSceneAction
} from "@/app/(admin)/admin/actions";
import { AdminCard, AdminEmptyState } from "@/components/admin/cards";
import { DialogueEntryForm } from "@/components/admin/dialogue-entry-form";
import {
  AdminPageShell,
  Field,
  Notice,
  PageHeader,
  Pill,
  SectionCard,
  SelectInput,
  TextInput
} from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { getAdminStoryData } from "@/lib/story/repository";
import { toPublicStorageUrl } from "@/lib/story/runtime";
import type { CharacterDefinition } from "@/lib/story/types";
import { getSupabaseEnv } from "@/lib/supabase/env";

type SceneDetailPageProps = {
  params: Promise<{
    chapterId: string;
    sceneId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getDialoguePreview(text: string) {
  return text.length > 220 ? `${text.slice(0, 217).trimEnd()}...` : text;
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function getSceneReadiness(scene: { dialogue: Array<unknown> }) {
  if (scene.dialogue.length === 0) {
    return {
      label: "Incomplete",
      tone: "warning" as const,
      description:
        "Add at least one dialogue row before this scene can play in the reader."
    };
  }

  return {
    label: "Playable",
    tone: "success" as const,
    description:
      "This scene is minimally playable in the current linear reader."
  };
}

export default async function SceneDetailPage({
  params,
  searchParams
}: SceneDetailPageProps) {
  const [{ chapterId, sceneId }, story] = await Promise.all([
    params,
    getAdminStoryData()
  ]);
  const query: Record<string, string | string[] | undefined> = searchParams
    ? await searchParams
    : {};
  const { url: supabaseUrl } = getSupabaseEnv();
  const chapter = story.chapters.find((item) => item.id === chapterId) ?? null;
  const scene = chapter?.scenes.find((item) => item.id === sceneId) ?? null;

  if (!chapter || !scene) {
    notFound();
  }

  const status = getParam(query.status);
  const message = getParam(query.message);
  const returnTo = `/admin/chapters/${chapter.id}/scenes/${scene.id}`;
  const backgroundImage =
    story.backgroundImages.find(
      (asset) => asset.id === scene.backgroundImageAssetId
    ) ?? null;
  const backgroundImageUrl = toPublicStorageUrl(
    supabaseUrl,
    backgroundImage?.filePath ?? null
  );
  const sceneCharacters = scene.characterIds
    .map(
      (characterId) =>
        story.characters.find((item) => item.id === characterId) ?? null
    )
    .filter((character): character is CharacterDefinition => character !== null)
    .map((character) => ({
      id: character.id,
      name: character.name,
      emotions: character.emotions.map((emotion) => ({
        key: emotion.key,
        label: emotion.label
      }))
    }));
  const sceneReadiness = getSceneReadiness(scene);
  const dialogueCountLabel =
    scene.dialogue.length === 1
      ? "1 dialogue row"
      : `${scene.dialogue.length} dialogue rows`;

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title={scene.title}
          description={`Scene ${scene.orderIndex} in ${chapter.title}`}
          actions={
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href={`/admin/chapters/${chapter.id}/scenes`}>
                  Back to Scenes
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/admin/chapters/${chapter.id}/settings`}>
                  Chapter Settings
                </Link>
              </Button>
            </div>
          }
        />

        {status === "success" && message ? (
          <Notice kind="success">{message}</Notice>
        ) : null}
        {status === "error" && message ? (
          <Notice kind="error">{message}</Notice>
        ) : null}

        <SectionCard
          title="Scene Settings"
          description="Keep scene metadata here while dialogue authoring stays below."
        >
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
              {backgroundImageUrl ? (
                <img
                  src={backgroundImageUrl}
                  alt={
                    backgroundImage?.altText ??
                    backgroundImage?.label ??
                    scene.title
                  }
                  className="aspect-video w-full object-cover"
                />
              ) : (
                <div className="flex aspect-video items-center justify-center text-sm text-slate-500">
                  No background preview
                </div>
              )}
            </div>

            <form action={updateSceneAction} className="space-y-4">
              <input type="hidden" name="chapterId" value={chapter.id} />
              <input type="hidden" name="sceneId" value={scene.id} />
              <input type="hidden" name="returnTo" value={returnTo} />

              <div className="flex flex-wrap gap-2">
                <Pill>Order {scene.orderIndex}</Pill>
                <Pill>{dialogueCountLabel}</Pill>
                <Pill>{scene.characterIds.length} characters in cast</Pill>
                <Pill tone={sceneReadiness.tone}>{sceneReadiness.label}</Pill>
              </div>

              <p className="text-sm text-slate-600">
                {sceneReadiness.description}
              </p>

              <div className="grid gap-4 md:grid-cols-[1fr_140px]">
                <Field label="Scene Title" htmlFor="scene-title">
                  <TextInput
                    id="scene-title"
                    name="title"
                    defaultValue={scene.title}
                    required
                  />
                </Field>

                <Field
                  label="Order"
                  htmlFor="scene-order"
                  hint="1 is first in chapter order."
                >
                  <TextInput
                    id="scene-order"
                    name="orderIndex"
                    type="number"
                    min={1}
                    step={1}
                    defaultValue={scene.orderIndex}
                    required
                  />
                </Field>
              </div>

              <Field label="Background Image" htmlFor="scene-background-image">
                <SelectInput
                  id="scene-background-image"
                  name="backgroundImageAssetId"
                  defaultValue={scene.backgroundImageAssetId}
                  required
                >
                  {story.backgroundImages.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field
                label="Background Music"
                htmlFor="scene-background-music"
                hint="Optional."
              >
                <SelectInput
                  id="scene-background-music"
                  name="backgroundMusicAssetId"
                  defaultValue={scene.backgroundMusicAssetId ?? ""}
                >
                  <option value="">No music</option>
                  {story.backgroundMusicTracks.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field
                label="Scene Characters"
                htmlFor="scene-character-pool"
                hint="These characters become available speakers for dialogue entries."
              >
                <div
                  id="scene-character-pool"
                  className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"
                >
                  {story.characters.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No characters exist yet. Dialogue remains narrator-only
                      until characters are created.
                    </p>
                  ) : (
                    story.characters.map((character) => (
                      <label
                        key={character.id}
                        className="flex items-center gap-2 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          name="characterIds"
                          value={character.id}
                          defaultChecked={scene.characterIds.includes(
                            character.id
                          )}
                          className="h-4 w-4 rounded border-slate-300 text-slate-900"
                        />
                        <span>{character.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </Field>

              <div className="flex justify-end">
                <Button type="submit">Save Scene</Button>
              </div>
            </form>
          </div>
        </SectionCard>

        <SectionCard
          title="Create Dialogue Entry"
          description="Add the next dialogue row. Narrator entries always work, and character entries only use the scene's current cast."
        >
          {sceneCharacters.length === 0 ? (
            <p className="text-sm text-slate-500">
              No scene characters are selected, so new dialogue entries will be
              narrator-only until the cast is expanded above.
            </p>
          ) : null}

          <DialogueEntryForm
            action={createDialogueEntryAction}
            chapterId={chapter.id}
            sceneId={scene.id}
            returnTo={returnTo}
            idPrefix={`dialogue-create-${scene.id}`}
            submitLabel="Add Dialogue Entry"
            sceneCharacters={sceneCharacters}
          />
        </SectionCard>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-950">Dialogue</h2>
            <p className="text-sm text-slate-600">
              Dialogue cards stay in runtime order and surface speaker context
              first. Editing and deletion stay tucked into a secondary panel on
              each card.
            </p>
          </div>

          {scene.dialogue.length === 0 ? (
            <AdminEmptyState
              title="No Dialogue Yet"
              description="Create the first dialogue entry above."
            />
          ) : (
            <div className="space-y-4">
              {scene.dialogue.map((entry) => {
                let speakerName = "Narrator";
                let emotionLabel: string | null = null;
                const speaker = entry.speaker;

                if (speaker.type === "character") {
                  const character =
                    story.characters.find(
                      (item) => item.id === speaker.characterId
                    ) ?? null;
                  const emotion =
                    character?.emotions.find(
                      (item) => item.key === speaker.emotionKey
                    ) ?? null;

                  speakerName = character?.name ?? "Unknown Character";
                  emotionLabel = emotion?.label ?? speaker.emotionKey;
                }

                return (
                  <AdminCard
                    key={entry.id}
                    title={speakerName}
                    eyebrow={`Dialogue ${entry.orderIndex}`}
                    description={
                      <div className="space-y-4">
                        <p className="whitespace-pre-wrap text-slate-700">
                          {getDialoguePreview(entry.text)}
                        </p>

                        <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <summary className="cursor-pointer text-sm font-medium text-slate-800">
                            Edit or delete dialogue entry
                          </summary>

                          <div className="mt-3 space-y-4">
                            <DialogueEntryForm
                              action={updateDialogueEntryAction}
                              chapterId={chapter.id}
                              sceneId={scene.id}
                              returnTo={returnTo}
                              idPrefix={`dialogue-edit-${entry.id}`}
                              submitLabel="Save Dialogue"
                              sceneCharacters={sceneCharacters}
                              initial={{
                                dialogueEntryId: entry.id,
                                orderIndex: entry.orderIndex,
                                text: entry.text,
                                speakerType: entry.speaker.type,
                                characterId:
                                  entry.speaker.type === "character"
                                    ? entry.speaker.characterId
                                    : "",
                                emotionKey:
                                  entry.speaker.type === "character"
                                    ? entry.speaker.emotionKey
                                    : ""
                              }}
                            />

                            <div className="border-t border-slate-200 pt-4">
                              <p className="text-sm text-slate-600">
                                Delete permanently removes this dialogue entry
                                from the scene order.
                              </p>
                              <form
                                action={deleteDialogueEntryAction}
                                className="mt-3 flex justify-end"
                              >
                                <input
                                  type="hidden"
                                  name="chapterId"
                                  value={chapter.id}
                                />
                                <input
                                  type="hidden"
                                  name="sceneId"
                                  value={scene.id}
                                />
                                <input
                                  type="hidden"
                                  name="dialogueEntryId"
                                  value={entry.id}
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
                                  Delete Dialogue
                                </Button>
                              </form>
                            </div>
                          </div>
                        </details>
                      </div>
                    }
                    footer={
                      <>
                        <Pill>Order {entry.orderIndex}</Pill>
                        <Pill>{speakerName}</Pill>
                        {emotionLabel ? <Pill>{emotionLabel}</Pill> : null}
                      </>
                    }
                  />
                );
              })}
            </div>
          )}
        </section>

        <SectionCard
          title="Delete Scene"
          description="Deleting a scene permanently removes the scene and all dialogue inside it."
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Use this only when the scene should be removed from{" "}
              <span className="font-medium text-slate-800">
                {chapter.title}
              </span>
              . This also removes {dialogueCountLabel}.
            </p>
            <form action={deleteSceneAction} className="space-y-4">
              <input type="hidden" name="chapterId" value={chapter.id} />
              <input type="hidden" name="sceneId" value={scene.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <label className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                <input
                  type="checkbox"
                  name="confirmDelete"
                  value="yes"
                  required
                  className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-700"
                />
                <span>
                  I understand that deleting this scene removes the scene and
                  all of its dialogue permanently.
                </span>
              </label>
              <div className="flex justify-end">
                <Button type="submit" variant="destructive">
                  Delete Scene
                </Button>
              </div>
            </form>
          </div>
        </SectionCard>
      </div>
    </AdminPageShell>
  );
}

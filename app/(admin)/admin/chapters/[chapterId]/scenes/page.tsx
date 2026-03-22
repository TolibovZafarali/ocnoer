/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";

import { createSceneAction } from "@/app/(admin)/admin/actions";
import {
  AdminCardGrid,
  AdminEmptyState,
  AdminLinkCard
} from "@/components/admin/cards";
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
import { getSupabaseEnv } from "@/lib/supabase/env";

type ChapterScenesPageProps = {
  params: Promise<{
    chapterId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function getSceneReadiness(scene: { dialogue: Array<unknown> }) {
  if (scene.dialogue.length === 0) {
    return {
      label: "No dialogue",
      tone: "warning" as const,
      description: "Add dialogue before this scene can play."
    };
  }

  return {
    label: "Playable",
    tone: "success" as const,
    description: "This scene has dialogue and can play linearly."
  };
}

export default async function ChapterScenesPage({
  params,
  searchParams
}: ChapterScenesPageProps) {
  const [{ chapterId }, story] = await Promise.all([
    params,
    getAdminStoryData()
  ]);
  const query: Record<string, string | string[] | undefined> = searchParams
    ? await searchParams
    : {};
  const { url: supabaseUrl } = getSupabaseEnv();
  const chapter = story.chapters.find((item) => item.id === chapterId) ?? null;

  if (!chapter) {
    notFound();
  }

  const status = getParam(query.status);
  const message = getParam(query.message);
  const returnTo = `/admin/chapters/${chapter.id}/scenes`;
  const sceneCreateBlocked = story.backgroundImages.length === 0;

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title={chapter.title}
          description="This is the main chapter destination. Create scenes here, then drill into each scene for dialogue and scene-level editing."
          actions={
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/admin/chapters">Back to Chapters</Link>
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
          title="Create Scene"
          description="Add a scene to this chapter. Background image is required; music and character pool are optional."
        >
          {sceneCreateBlocked ? (
            <Notice kind="error">
              Scene creation is blocked until at least one background image
              asset exists.
            </Notice>
          ) : null}

          <form action={createSceneAction} className="space-y-4">
            <input type="hidden" name="chapterId" value={chapter.id} />
            <input type="hidden" name="returnTo" value={returnTo} />

            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Scene Title" htmlFor="scene-title">
                <TextInput
                  id="scene-title"
                  name="title"
                  placeholder="Campfire at Dusk"
                  required
                />
              </Field>

              <Field
                label="Background Image"
                htmlFor="background-image-asset"
                hint="Required for every scene."
              >
                <SelectInput
                  id="background-image-asset"
                  name="backgroundImageAssetId"
                  defaultValue=""
                  required
                  disabled={sceneCreateBlocked}
                >
                  <option value="" disabled>
                    Select a background image
                  </option>
                  {story.backgroundImages.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Field
                label="Background Music"
                htmlFor="background-music-asset"
                hint="Optional."
              >
                <SelectInput
                  id="background-music-asset"
                  name="backgroundMusicAssetId"
                  defaultValue=""
                  disabled={sceneCreateBlocked}
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
                label="Dress Carry"
                htmlFor="carry-ocnoer-dress-selection"
                hint="When enabled, Ocnoer keeps the currently selected dress from prior scenes."
              >
                <label
                  htmlFor="carry-ocnoer-dress-selection"
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                >
                  <input
                    type="hidden"
                    name="carryOcnoerDressSelection"
                    value="false"
                  />
                  <input
                    id="carry-ocnoer-dress-selection"
                    type="checkbox"
                    name="carryOcnoerDressSelection"
                    value="true"
                    defaultChecked
                    className="h-4 w-4 rounded border-slate-300 text-slate-900"
                  />
                  <span>Carry selected dress from previous scenes</span>
                </label>
              </Field>

              <Field
                label="Scene Characters"
                htmlFor="scene-character-pool"
                hint="Selected characters are available as dialogue speakers in this scene."
              >
                <div
                  id="scene-character-pool"
                  className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"
                >
                  {story.characters.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No characters yet. Scene dialogue will be narrator-only
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
                          className="h-4 w-4 rounded border-slate-300 text-slate-900"
                        />
                        <span>{character.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </Field>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={sceneCreateBlocked}>
                Create Scene
              </Button>
            </div>
          </form>
        </SectionCard>

        {chapter.scenes.length === 0 ? (
          <AdminEmptyState
            title="No Scenes Yet"
            description="Create the first scene above to begin the chapter flow."
          />
        ) : (
          <AdminCardGrid>
            {chapter.scenes.map((scene) => {
              const readiness = getSceneReadiness(scene);
              const backgroundImage =
                story.backgroundImages.find(
                  (asset) => asset.id === scene.backgroundImageAssetId
                ) ?? null;
              const backgroundMusic =
                story.backgroundMusicTracks.find(
                  (asset) => asset.id === scene.backgroundMusicAssetId
                ) ?? null;
              const imageUrl = toPublicStorageUrl(
                supabaseUrl,
                backgroundImage?.filePath ?? null
              );

              return (
                <AdminLinkCard
                  key={scene.id}
                  href={`/admin/chapters/${chapter.id}/scenes/${scene.id}`}
                  title={scene.title}
                  eyebrow={`Scene ${scene.orderIndex}`}
                  media={
                    imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={
                          backgroundImage?.altText ??
                          backgroundImage?.label ??
                          scene.title
                        }
                        className="aspect-video w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-video items-center justify-center bg-slate-100 text-sm text-slate-500">
                        No background preview
                      </div>
                    )
                  }
                  description={
                    <div className="space-y-1">
                      <p>
                        {backgroundImage?.label ??
                          "Missing background reference"}
                      </p>
                      <p className="text-sm text-slate-500">
                        {scene.characterIds.length} cast
                        {backgroundMusic
                          ? `, music: ${backgroundMusic.label}`
                          : ""}
                      </p>
                    </div>
                  }
                  footer={
                    <>
                      <Pill>Order {scene.orderIndex}</Pill>
                      <Pill>{scene.dialogue.length} dialogue rows</Pill>
                      <Pill tone={readiness.tone}>{readiness.label}</Pill>
                    </>
                  }
                />
              );
            })}
          </AdminCardGrid>
        )}
      </div>
    </AdminPageShell>
  );
}

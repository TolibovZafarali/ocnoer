import Link from "next/link";
import { notFound } from "next/navigation";

import {
  createSceneAction,
  updateChapterAction,
  deleteChapterAction,
  deleteSceneAction
} from "@/app/(admin)/admin/actions";
import {
  AdminPageShell,
  Field,
  FormGrid,
  Notice,
  PageHeader,
  Pill,
  SectionCard,
  SelectInput,
  TextInput
} from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { getAdminStoryData } from "@/lib/story/repository";

type ChapterDetailPageProps = {
  params: Promise<{
    chapterId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function ChapterDetailPage({
  params,
  searchParams
}: ChapterDetailPageProps) {
  const [{ chapterId }, story] = await Promise.all([params, getAdminStoryData()]);
  const query: Record<string, string | string[] | undefined> = searchParams
    ? await searchParams
    : {};
  const chapter = story.chapters.find((item) => item.id === chapterId) ?? null;

  if (!chapter) {
    notFound();
  }

  const status = getParam(query.status);
  const message = getParam(query.message);
  const returnTo = `/admin/chapters/${chapter.id}`;

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title={chapter.title}
          description="Edit chapter metadata, then add or remove scenes inside this chapter."
          actions={
            <Button asChild variant="outline">
              <Link href="/admin/chapters">Back to Chapters</Link>
            </Button>
          }
        />

        {status === "success" && message ? <Notice kind="success">{message}</Notice> : null}
        {status === "error" && message ? <Notice kind="error">{message}</Notice> : null}

        <SectionCard
          title="Chapter Settings"
          description="Chapter order controls the runtime chapter sequence."
        >
          <form action={updateChapterAction} className="space-y-4">
            <input type="hidden" name="chapterId" value={chapter.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <FormGrid>
              <Field htmlFor="chapter-title" label="Title">
                <TextInput id="chapter-title" name="title" defaultValue={chapter.title} required />
              </Field>
              <Field htmlFor="chapter-slug" label="Slug">
                <TextInput id="chapter-slug" name="slug" defaultValue={chapter.slug} required />
              </Field>
              <Field htmlFor="chapter-order" label="Order Index">
                <TextInput
                  id="chapter-order"
                  name="orderIndex"
                  type="number"
                  defaultValue={chapter.orderIndex}
                  required
                />
              </Field>
            </FormGrid>
            <div className="flex flex-wrap justify-end gap-3">
              <Button type="submit">Save Chapter</Button>
            </div>
          </form>
          <form action={deleteChapterAction} className="flex justify-end">
            <input type="hidden" name="chapterId" value={chapter.id} />
            <input type="hidden" name="returnTo" value="/admin/chapters" />
            <Button type="submit" variant="destructive">
              Delete Chapter
            </Button>
          </form>
        </SectionCard>

        <SectionCard
          title="Create Scene"
          description="Choose the background, optional music, and the scene cast pool in one step."
        >
          <form action={createSceneAction} className="space-y-4">
            <input type="hidden" name="chapterId" value={chapter.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <FormGrid>
              <Field htmlFor="scene-title" label="Scene Title">
                <TextInput id="scene-title" name="title" required />
              </Field>
              <Field htmlFor="scene-order" label="Order Index">
                <TextInput id="scene-order" name="orderIndex" type="number" required />
              </Field>
              <Field htmlFor="backgroundImageAssetId" label="Background Image">
                <SelectInput id="backgroundImageAssetId" name="backgroundImageAssetId" required>
                  <option value="">Select a background</option>
                  {story.backgroundImages.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field htmlFor="backgroundMusicAssetId" label="Background Music">
                <SelectInput id="backgroundMusicAssetId" name="backgroundMusicAssetId">
                  <option value="">No music</option>
                  {story.backgroundMusicTracks.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </FormGrid>

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-800">Scene Characters</p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {story.characters.map((character) => (
                  <label
                    key={character.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  >
                    <input type="checkbox" name="characterIds" value={character.id} />
                    <span>{character.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={story.backgroundImages.length === 0}
              >
                Create Scene
              </Button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Scenes"
          description="Open a scene to edit its cast, background, music, and dialogue."
        >
          {chapter.scenes.length === 0 ? (
            <p className="text-sm text-slate-600">
              No scenes yet. Create the first scene above.
            </p>
          ) : (
            <div className="space-y-4">
              {chapter.scenes.map((scene) => {
                const backgroundImage =
                  story.backgroundImages.find(
                    (asset) => asset.id === scene.backgroundImageAssetId
                  ) ?? null;
                const backgroundMusic =
                  story.backgroundMusicTracks.find(
                    (asset) => asset.id === scene.backgroundMusicAssetId
                  ) ?? null;
                const castNames = scene.characterIds
                  .map(
                    (characterId) =>
                      story.characters.find((character) => character.id === characterId)?.name
                  )
                  .filter(Boolean);

                return (
                  <div
                    key={scene.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <Pill>Scene {scene.orderIndex}</Pill>
                          <Pill>{scene.dialogue.length} dialogue rows</Pill>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-950">
                            {scene.title}
                          </h3>
                          <p className="mt-1 text-sm text-slate-600">
                            Background: {backgroundImage?.label ?? "Missing"}
                            {backgroundMusic ? `, Music: ${backgroundMusic.label}` : ", No music"}
                          </p>
                        </div>
                        <p className="text-sm text-slate-600">
                          Cast pool: {castNames.length > 0 ? castNames.join(", ") : "Narrator only"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button asChild variant="outline">
                          <Link href={`/admin/chapters/${chapter.id}/scenes/${scene.id}`}>
                            Edit Scene
                          </Link>
                        </Button>
                        <form action={deleteSceneAction}>
                          <input type="hidden" name="chapterId" value={chapter.id} />
                          <input type="hidden" name="sceneId" value={scene.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <Button type="submit" variant="destructive">
                            Delete Scene
                          </Button>
                        </form>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </AdminPageShell>
  );
}

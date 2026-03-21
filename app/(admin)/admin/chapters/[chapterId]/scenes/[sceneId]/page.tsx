import Link from "next/link";
import { notFound } from "next/navigation";

import {
  discardSceneDraftAction,
  deleteSceneAction,
  saveSceneDraftAction,
  upsertSceneDraftAction
} from "@/app/(admin)/admin/actions";
import { SceneDraftEditor } from "@/components/admin/scene-draft-editor";
import {
  AdminPageShell,
  Notice,
  PageHeader,
  SectionCard
} from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { createSceneDraftPayload } from "@/lib/story/scene-draft";
import {
  discardSceneDraft,
  getAdminStoryData,
  getSceneDraft
} from "@/lib/story/repository";
import { getSupabaseEnv } from "@/lib/supabase/env";

type SceneDetailPageProps = {
  params: Promise<{
    chapterId: string;
    sceneId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function SceneDetailPage({
  params,
  searchParams
}: SceneDetailPageProps) {
  const { chapterId, sceneId } = await params;
  const [story, savedDraft] = await Promise.all([
    getAdminStoryData(),
    getSceneDraft(sceneId)
  ]);
  const query: Record<string, string | string[] | undefined> = searchParams
    ? await searchParams
    : {};
  const { url: supabaseUrl } = getSupabaseEnv();
  const chapter = story.chapters.find((item) => item.id === chapterId) ?? null;
  const scene = chapter?.scenes.find((item) => item.id === sceneId) ?? null;

  if (!chapter || !scene) {
    if (savedDraft) {
      await discardSceneDraft(sceneId);
    }

    notFound();
  }

  const activeDraft =
    savedDraft && savedDraft.chapterId === chapterId ? savedDraft : null;

  if (savedDraft && !activeDraft) {
    await discardSceneDraft(sceneId);
  }

  const status = getParam(query.status);
  const message = getParam(query.message);
  const returnTo = `/admin/chapters/${chapter.id}/scenes/${scene.id}`;
  const initialDraft = activeDraft?.payload ?? createSceneDraftPayload(scene);
  const dialogueCountLabel =
    initialDraft.dialogue.length === 1
      ? "1 dialogue row"
      : `${initialDraft.dialogue.length} dialogue rows`;

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

        <SceneDraftEditor
          chapterId={chapter.id}
          sceneId={scene.id}
          returnTo={returnTo}
          supabaseUrl={supabaseUrl}
          initialDraft={initialDraft}
          initialDraftLoaded={activeDraft !== null}
          initialSourceSceneUpdatedAt={
            activeDraft?.sourceSceneUpdatedAt ?? scene.updatedAt
          }
          backgroundImages={story.backgroundImages.map((asset) => ({
            id: asset.id,
            label: asset.label,
            altText: asset.altText,
            filePath: asset.filePath
          }))}
          backgroundMusicTracks={story.backgroundMusicTracks.map((asset) => ({
            id: asset.id,
            label: asset.label
          }))}
          characters={story.characters.map((character) => ({
            id: character.id,
            name: character.name,
            slug: character.slug,
            emotions: character.emotions.map((emotion) => ({
              key: emotion.key,
              label: emotion.label
            })),
            dresses: character.dresses.map((dress) => ({
              key: dress.key,
              label: dress.label
            }))
          }))}
          upsertDraftAction={upsertSceneDraftAction}
          saveSceneDraftAction={saveSceneDraftAction}
          discardSceneDraftAction={discardSceneDraftAction}
        />

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

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminCard, AdminEmptyState } from "@/components/admin/cards";
import {
  AdminPageShell,
  PageHeader,
  Pill,
  SectionCard
} from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { getAdminStoryData } from "@/lib/story/repository";
import { toPublicStorageUrl } from "@/lib/story/runtime";
import { getSupabaseEnv } from "@/lib/supabase/env";

type SceneDetailPageProps = {
  params: Promise<{
    chapterId: string;
    sceneId: string;
  }>;
};

function getDialoguePreview(text: string) {
  return text.length > 220 ? `${text.slice(0, 217).trimEnd()}...` : text;
}

export default async function SceneDetailPage({
  params
}: SceneDetailPageProps) {
  const [{ chapterId, sceneId }, story] = await Promise.all([
    params,
    getAdminStoryData()
  ]);
  const { url: supabaseUrl } = getSupabaseEnv();
  const chapter = story.chapters.find((item) => item.id === chapterId) ?? null;
  const scene = chapter?.scenes.find((item) => item.id === sceneId) ?? null;

  if (!chapter || !scene) {
    notFound();
  }

  const backgroundImage =
    story.backgroundImages.find(
      (asset) => asset.id === scene.backgroundImageAssetId
    ) ?? null;
  const backgroundImageUrl = toPublicStorageUrl(
    supabaseUrl,
    backgroundImage?.filePath ?? null
  );

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

        <SectionCard
          title="Scene Summary"
          description="Phase 1 keeps the detail view focused on reading the dialogue sequence in order."
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
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Pill>Order {scene.orderIndex}</Pill>
                <Pill>{scene.dialogue.length} dialogue rows</Pill>
                <Pill>{scene.characterIds.length} characters in cast</Pill>
              </div>
              <div className="space-y-2 text-sm text-slate-600">
                <p>
                  <span className="font-medium text-slate-800">
                    Background:
                  </span>{" "}
                  {backgroundImage?.label ?? "Missing background reference"}
                </p>
                <p>
                  <span className="font-medium text-slate-800">Music:</span>{" "}
                  {scene.backgroundMusicAssetId
                    ? (story.backgroundMusicTracks.find(
                        (asset) => asset.id === scene.backgroundMusicAssetId
                      )?.label ?? "Missing music reference")
                    : "No music assigned"}
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-950">Dialogue</h2>
            <p className="text-sm text-slate-600">
              Dialogue cards stay in runtime order and surface speaker context
              only.
            </p>
          </div>

          {scene.dialogue.length === 0 ? (
            <AdminEmptyState
              title="No Dialogue Yet"
              description="Phase 2 can reintroduce authoring controls here. For now this detail page is a read-oriented card view."
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
                      <p className="whitespace-pre-wrap text-slate-700">
                        {getDialoguePreview(entry.text)}
                      </p>
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
      </div>
    </AdminPageShell>
  );
}

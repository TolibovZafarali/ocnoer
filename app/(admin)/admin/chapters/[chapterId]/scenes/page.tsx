/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AdminCardGrid,
  AdminEmptyState,
  AdminLinkCard
} from "@/components/admin/cards";
import {
  AdminPageShell,
  Notice,
  PageHeader,
  Pill
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

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title={chapter.title}
          description="This is the primary chapter destination. Scenes stay ordered here, while chapter settings live on their own route."
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

        {chapter.scenes.length === 0 ? (
          <AdminEmptyState
            title="No Scenes Yet"
            description="Phase 1 only establishes the chapter-to-scenes drill-down. Scene creation and editing flows can land in Phase 2."
          />
        ) : (
          <AdminCardGrid>
            {chapter.scenes.map((scene) => {
              const backgroundImage =
                story.backgroundImages.find(
                  (asset) => asset.id === scene.backgroundImageAssetId
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
                    <p>
                      {backgroundImage?.label ?? "Missing background reference"}
                    </p>
                  }
                  footer={
                    <>
                      <Pill>Order {scene.orderIndex}</Pill>
                      <Pill>{scene.dialogue.length} dialogue rows</Pill>
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

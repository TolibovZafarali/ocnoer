import Link from "next/link";

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
import { getAdminStoryData } from "@/lib/story/repository";

type ChaptersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function ChaptersPage({
  searchParams
}: ChaptersPageProps) {
  const story = await getAdminStoryData();
  const params: Record<string, string | string[] | undefined> = searchParams
    ? await searchParams
    : {};
  const status = getParam(params.status);
  const message = getParam(params.message);
  const firstChapter = story.chapters[0] ?? null;

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title="Chapters"
          description="Browse the chapter list and drill into each chapter's ordered scene flow."
          actions={
            <p className="text-sm text-slate-500">
              Main destination:{" "}
              <span className="font-medium text-slate-700">Scenes</span>
            </p>
          }
        />

        {status === "success" && message ? (
          <Notice kind="success">{message}</Notice>
        ) : null}
        {status === "error" && message ? (
          <Notice kind="error">{message}</Notice>
        ) : null}

        {story.chapters.length === 0 ? (
          <AdminEmptyState
            title="No Chapters Yet"
            description="Phase 1 keeps this area focused on browse-first navigation. Chapter creation and editing flows can expand in Phase 2."
          />
        ) : (
          <AdminCardGrid>
            {story.chapters.map((chapter) => (
              <AdminLinkCard
                key={chapter.id}
                href={`/admin/chapters/${chapter.id}/scenes`}
                title={chapter.title}
                eyebrow={`Chapter ${chapter.orderIndex}`}
                description={
                  <p>
                    {chapter.scenes.length === 1
                      ? "1 scene"
                      : `${chapter.scenes.length} scenes`}
                  </p>
                }
                footer={
                  <>
                    <Pill>Order {chapter.orderIndex}</Pill>
                    <Pill>{chapter.scenes.length} scenes</Pill>
                  </>
                }
              />
            ))}
          </AdminCardGrid>
        )}

        {firstChapter ? (
          <p className="text-sm text-slate-500">
            Chapter settings live at{" "}
            <Link
              href={`/admin/chapters/${firstChapter.id}/settings`}
              className="font-medium text-slate-700 underline"
            >
              /admin/chapters/[chapterId]/settings
            </Link>
            .
          </p>
        ) : null}
      </div>
    </AdminPageShell>
  );
}

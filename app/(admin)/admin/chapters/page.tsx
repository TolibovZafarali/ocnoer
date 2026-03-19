import Link from "next/link";

import {
  AdminCardGrid,
  AdminEmptyState,
  AdminLinkCard
} from "@/components/admin/cards";
import { CreateChapterForm } from "@/components/admin/create-chapter-form";
import {
  AdminPageShell,
  Notice,
  PageHeader,
  Pill,
  SectionCard
} from "@/components/admin/forms";
import { getAdminStoryData } from "@/lib/story/repository";

type ChaptersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function getChapterReadiness(chapter: {
  scenes: Array<{ dialogue: Array<unknown> }>;
}) {
  if (chapter.scenes.length === 0) {
    return {
      label: "No scenes",
      tone: "warning" as const,
      description: "Add the first scene to make this chapter playable."
    };
  }

  if (chapter.scenes.some((scene) => scene.dialogue.length === 0)) {
    return {
      label: "Incomplete",
      tone: "warning" as const,
      description: "One or more scenes still need dialogue."
    };
  }

  return {
    label: "Playable",
    tone: "success" as const,
    description: "Every scene has dialogue."
  };
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
          description="Create a chapter from its title, then drill straight into that chapter's ordered scene flow."
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

        <SectionCard
          title="Create Chapter"
          description="Enter the chapter title. The slug and order are derived automatically."
        >
          <CreateChapterForm />
        </SectionCard>

        {story.chapters.length === 0 ? (
          <AdminEmptyState
            title="No Chapters Yet"
            description="Create the first chapter above to start the authoring flow."
          />
        ) : (
          <AdminCardGrid>
            {story.chapters.map((chapter) => {
              const readiness = getChapterReadiness(chapter);

              return (
                <AdminLinkCard
                  key={chapter.id}
                  href={`/admin/chapters/${chapter.id}/scenes`}
                  title={chapter.title}
                  eyebrow={`Chapter ${chapter.orderIndex}`}
                  description={
                    <div className="space-y-1">
                      <p>
                        {chapter.scenes.length === 1
                          ? "1 scene"
                          : `${chapter.scenes.length} scenes`}
                      </p>
                      <p className="text-sm text-slate-500">
                        {readiness.description}
                      </p>
                    </div>
                  }
                  footer={
                    <>
                      <Pill>Order {chapter.orderIndex}</Pill>
                      <Pill>{chapter.scenes.length} scenes</Pill>
                      <Pill tone={readiness.tone}>{readiness.label}</Pill>
                    </>
                  }
                />
              );
            })}
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

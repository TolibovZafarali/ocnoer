import Link from "next/link";

import { createChapterAction } from "@/app/(admin)/admin/actions";
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
  TextInput
} from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
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
          <form action={createChapterAction} className="space-y-4">
            <input type="hidden" name="returnTo" value="/admin/chapters" />
            <Field
              label="Chapter Title"
              htmlFor="chapter-title"
              hint="New chapters redirect to their scenes page after save."
            >
              <TextInput
                id="chapter-title"
                name="title"
                placeholder="Chapter 1: Arrival"
                required
              />
            </Field>

            <div className="flex justify-end">
              <Button type="submit">Create Chapter</Button>
            </div>
          </form>
        </SectionCard>

        {story.chapters.length === 0 ? (
          <AdminEmptyState
            title="No Chapters Yet"
            description="Create the first chapter above to start the authoring flow."
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

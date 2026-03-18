import Link from "next/link";
import { notFound } from "next/navigation";

import {
  deleteChapterAction,
  updateChapterAction
} from "@/app/(admin)/admin/actions";
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

type ChapterSettingsPageProps = {
  params: Promise<{
    chapterId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function ChapterSettingsPage({
  params,
  searchParams
}: ChapterSettingsPageProps) {
  const [{ chapterId }, story] = await Promise.all([
    params,
    getAdminStoryData()
  ]);
  const query: Record<string, string | string[] | undefined> = searchParams
    ? await searchParams
    : {};
  const chapter = story.chapters.find((item) => item.id === chapterId) ?? null;

  if (!chapter) {
    notFound();
  }

  const status = getParam(query.status);
  const message = getParam(query.message);
  const returnTo = `/admin/chapters/${chapter.id}/settings`;
  const dialogueCount = chapter.scenes.reduce(
    (total, scene) => total + scene.dialogue.length,
    0
  );
  const sceneCountLabel =
    chapter.scenes.length === 1 ? "1 scene" : `${chapter.scenes.length} scenes`;
  const dialogueCountLabel =
    dialogueCount === 1 ? "1 dialogue row" : `${dialogueCount} dialogue rows`;

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title={`${chapter.title} Settings`}
          description="Edit chapter-level metadata here while keeping scene navigation on the main chapter route."
          actions={
            <Button asChild variant="outline">
              <Link href={`/admin/chapters/${chapter.id}/scenes`}>
                Back to Scenes
              </Link>
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
          title="Edit Chapter"
          description="Title is the primary field here. The slug remains visible but is not the main editing surface."
        >
          <form action={updateChapterAction} className="space-y-4">
            <input type="hidden" name="chapterId" value={chapter.id} />
            <input type="hidden" name="slug" value={chapter.slug} />
            <input type="hidden" name="orderIndex" value={chapter.orderIndex} />
            <input type="hidden" name="returnTo" value={returnTo} />

            <div className="flex flex-wrap gap-2">
              <Pill>Order {chapter.orderIndex}</Pill>
              <Pill>{chapter.scenes.length} scenes</Pill>
              <Pill>{chapter.slug}</Pill>
            </div>

            <Field label="Chapter Title" htmlFor="chapter-title">
              <TextInput
                id="chapter-title"
                name="title"
                defaultValue={chapter.title}
                required
              />
            </Field>

            <div className="flex justify-end">
              <Button type="submit">Save Chapter</Button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Delete Chapter"
          description="Deleting a chapter permanently removes the chapter and every scene and dialogue entry inside it."
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Use this only when the full chapter subtree should be removed from
              the story authoring flow. This will delete {sceneCountLabel} and{" "}
              {dialogueCountLabel}.
            </p>
            <form action={deleteChapterAction} className="space-y-4">
              <input type="hidden" name="chapterId" value={chapter.id} />
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
                  I understand that deleting this chapter also removes every
                  scene and dialogue entry inside it.
                </span>
              </label>
              <div className="flex justify-end">
                <Button type="submit" variant="destructive">
                  Delete Chapter
                </Button>
              </div>
            </form>
          </div>
        </SectionCard>
      </div>
    </AdminPageShell>
  );
}

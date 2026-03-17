import Link from "next/link";

import {
  createChapterAction,
  deleteChapterAction,
  updateChapterAction
} from "@/app/(admin)/admin/actions";
import {
  AdminPageShell,
  Field,
  FormGrid,
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
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function ChaptersPage({ searchParams }: ChaptersPageProps) {
  const story = await getAdminStoryData();
  const params: Record<string, string | string[] | undefined> = searchParams
    ? await searchParams
    : {};
  const status = getParam(params.status);
  const message = getParam(params.message);

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title="Chapters"
          description="Create chapters, set their runtime order, then jump directly into chapter-specific scene authoring."
        />

        {status === "success" && message ? <Notice kind="success">{message}</Notice> : null}
        {status === "error" && message ? <Notice kind="error">{message}</Notice> : null}

        <SectionCard
          title="Create Chapter"
          description="New chapters redirect immediately into their scene-management page."
        >
          <form action={createChapterAction} className="space-y-4">
            <input type="hidden" name="returnTo" value="/admin/chapters" />
            <FormGrid>
              <Field htmlFor="chapter-title" label="Title">
                <TextInput id="chapter-title" name="title" required />
              </Field>
              <Field htmlFor="chapter-slug" label="Slug">
                <TextInput id="chapter-slug" name="slug" required />
              </Field>
              <Field htmlFor="chapter-order" label="Order Index">
                <TextInput id="chapter-order" name="orderIndex" type="number" required />
              </Field>
            </FormGrid>
            <div className="flex justify-end">
              <Button type="submit">Create Chapter</Button>
            </div>
          </form>
        </SectionCard>

        {story.chapters.length === 0 ? (
          <SectionCard
            title="No Chapters Yet"
            description="Create the first chapter to start building scenes and dialogue."
          />
        ) : (
          <div className="space-y-5">
            {story.chapters.map((chapter) => (
              <SectionCard
                key={chapter.id}
                title={chapter.title}
                description={`Slug: ${chapter.slug}`}
              >
                <div className="flex flex-wrap gap-2">
                  <Pill>Order {chapter.orderIndex}</Pill>
                  <Pill>{chapter.scenes.length} scenes</Pill>
                </div>
                <form action={updateChapterAction} className="space-y-4">
                  <input type="hidden" name="chapterId" value={chapter.id} />
                  <input type="hidden" name="returnTo" value="/admin/chapters" />
                  <FormGrid>
                    <Field htmlFor={`chapter-title-${chapter.id}`} label="Title">
                      <TextInput
                        id={`chapter-title-${chapter.id}`}
                        name="title"
                        defaultValue={chapter.title}
                        required
                      />
                    </Field>
                    <Field htmlFor={`chapter-slug-${chapter.id}`} label="Slug">
                      <TextInput
                        id={`chapter-slug-${chapter.id}`}
                        name="slug"
                        defaultValue={chapter.slug}
                        required
                      />
                    </Field>
                    <Field htmlFor={`chapter-order-${chapter.id}`} label="Order Index">
                      <TextInput
                        id={`chapter-order-${chapter.id}`}
                        name="orderIndex"
                        type="number"
                        defaultValue={chapter.orderIndex}
                        required
                      />
                    </Field>
                  </FormGrid>
                  <div className="flex flex-wrap justify-end gap-3">
                    <Button asChild variant="outline">
                      <Link href={`/admin/chapters/${chapter.id}`}>Manage Scenes</Link>
                    </Button>
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
            ))}
          </div>
        )}
      </div>
    </AdminPageShell>
  );
}

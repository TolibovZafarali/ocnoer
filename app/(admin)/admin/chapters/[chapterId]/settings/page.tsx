import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminCard } from "@/components/admin/cards";
import {
  AdminPageShell,
  PageHeader,
  Pill,
  SectionCard
} from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { getAdminStoryData } from "@/lib/story/repository";

type ChapterSettingsPageProps = {
  params: Promise<{
    chapterId: string;
  }>;
};

export default async function ChapterSettingsPage({
  params
}: ChapterSettingsPageProps) {
  const [{ chapterId }, story] = await Promise.all([
    params,
    getAdminStoryData()
  ]);
  const chapter = story.chapters.find((item) => item.id === chapterId) ?? null;

  if (!chapter) {
    notFound();
  }

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title={`${chapter.title} Settings`}
          description="Phase 1 provides a clean destination in the drill-down flow without reintroducing the old form-heavy editing surface."
          actions={
            <Button asChild variant="outline">
              <Link href={`/admin/chapters/${chapter.id}/scenes`}>
                Back to Scenes
              </Link>
            </Button>
          }
        />

        <SectionCard
          title="Current Summary"
          description="Existing chapter metadata is still available from the story repository."
        >
          <div className="flex flex-wrap gap-2">
            <Pill>Order {chapter.orderIndex}</Pill>
            <Pill>{chapter.scenes.length} scenes</Pill>
            <Pill>{chapter.slug}</Pill>
          </div>
        </SectionCard>

        <AdminCard
          title="Phase 2"
          eyebrow="Placeholder"
          description={
            <p>
              Full chapter settings controls, validation, and editing actions
              can return here in the next phase. For now this route exists to
              keep settings separate from the main scene navigation path.
            </p>
          }
        />
      </div>
    </AdminPageShell>
  );
}

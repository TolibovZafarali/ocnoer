import { redirect } from "next/navigation";

type ChapterPageProps = {
  params: Promise<{
    chapterId: string;
  }>;
};

export default async function ChapterPage({ params }: ChapterPageProps) {
  const { chapterId } = await params;

  redirect(`/admin/chapters/${chapterId}/scenes`);
}

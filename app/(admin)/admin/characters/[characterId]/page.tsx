/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AdminCard,
  AdminCardGrid,
  AdminEmptyState
} from "@/components/admin/cards";
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

type CharacterDetailPageProps = {
  params: Promise<{
    characterId: string;
  }>;
};

export default async function CharacterDetailPage({
  params
}: CharacterDetailPageProps) {
  const [{ characterId }, story] = await Promise.all([
    params,
    getAdminStoryData()
  ]);
  const { url: supabaseUrl } = getSupabaseEnv();
  const character =
    story.characters.find((item) => item.id === characterId) ?? null;

  if (!character) {
    notFound();
  }

  const defaultEmotion =
    character.emotions.find(
      (emotion) => emotion.key === character.defaultEmotionKey
    ) ??
    character.emotions[0] ??
    null;
  const previewUrl = toPublicStorageUrl(
    supabaseUrl,
    defaultEmotion?.imagePath ?? null
  );

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title={character.name}
          description="Emotion variants are grouped here so the main character index can stay lightweight."
          actions={
            <Button asChild variant="outline">
              <Link href="/admin/characters">Back to Characters</Link>
            </Button>
          }
        />

        <SectionCard
          title="Character Summary"
          description="Phase 1 surfaces the character identity and default state without restoring the full editing workflow."
        >
          <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={`${character.name} default emotion`}
                  className="aspect-[4/5] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[4/5] items-center justify-center text-sm text-slate-500">
                  No image
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Pill>{character.emotions.length} emotions</Pill>
                <Pill>Default: {character.defaultEmotionKey}</Pill>
                <Pill>{character.slug}</Pill>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                {character.bio?.trim() ||
                  "No character bio has been authored yet."}
              </p>
            </div>
          </div>
        </SectionCard>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-950">Emotions</h2>
            <p className="text-sm text-slate-600">
              Emotion cards show the image, label, key, and whether the emotion
              is the default.
            </p>
          </div>

          {character.emotions.length === 0 ? (
            <AdminEmptyState
              title="No Emotions Yet"
              description="Phase 2 can bring authoring controls back here. This phase only establishes the route and card layout."
            />
          ) : (
            <AdminCardGrid className="xl:grid-cols-2">
              {character.emotions.map((emotion) => {
                const emotionUrl = toPublicStorageUrl(
                  supabaseUrl,
                  emotion.imagePath
                );
                const isDefault = emotion.key === character.defaultEmotionKey;

                return (
                  <AdminCard
                    key={emotion.id}
                    title={emotion.label}
                    eyebrow={emotion.key}
                    media={
                      emotionUrl ? (
                        <img
                          src={emotionUrl}
                          alt={`${character.name} ${emotion.label}`}
                          className="aspect-[4/5] w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[4/5] items-center justify-center bg-slate-100 text-sm text-slate-500">
                          No image
                        </div>
                      )
                    }
                    description={
                      <p>
                        Emotion key:{" "}
                        <span className="font-medium text-slate-700">
                          {emotion.key}
                        </span>
                      </p>
                    }
                    footer={
                      <>
                        <Pill>{emotion.label}</Pill>
                        <Pill>{emotion.key}</Pill>
                        {isDefault ? <Pill>Default</Pill> : null}
                      </>
                    }
                  />
                );
              })}
            </AdminCardGrid>
          )}
        </section>
      </div>
    </AdminPageShell>
  );
}

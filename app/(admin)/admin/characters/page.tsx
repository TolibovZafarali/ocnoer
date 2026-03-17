/* eslint-disable @next/next/no-img-element */

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
import { toPublicStorageUrl } from "@/lib/story/runtime";
import { getSupabaseEnv } from "@/lib/supabase/env";

type CharactersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function CharactersPage({
  searchParams
}: CharactersPageProps) {
  const story = await getAdminStoryData();
  const params: Record<string, string | string[] | undefined> = searchParams
    ? await searchParams
    : {};
  const { url: supabaseUrl } = getSupabaseEnv();
  const status = getParam(params.status);
  const message = getParam(params.message);

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title="Characters"
          description="Browse the cast first, then drill into a single character to inspect emotion variants."
        />

        {status === "success" && message ? (
          <Notice kind="success">{message}</Notice>
        ) : null}
        {status === "error" && message ? (
          <Notice kind="error">{message}</Notice>
        ) : null}

        {story.characters.length === 0 ? (
          <AdminEmptyState
            title="No Characters Yet"
            description="Phase 1 keeps the character area focused on navigation and visual structure. Creation and editing flows can expand in Phase 2."
          />
        ) : (
          <AdminCardGrid>
            {story.characters.map((character) => {
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
                <AdminLinkCard
                  key={character.id}
                  href={`/admin/characters/${character.id}`}
                  title={character.name}
                  eyebrow="Character"
                  media={
                    previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={`${character.name} default emotion`}
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
                      Default emotion:{" "}
                      {defaultEmotion?.label ?? character.defaultEmotionKey}
                    </p>
                  }
                  footer={
                    <>
                      <Pill>{character.emotions.length} emotions</Pill>
                      <Pill>Default: {character.defaultEmotionKey}</Pill>
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

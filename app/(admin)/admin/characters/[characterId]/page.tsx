/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addCharacterEmotionAction,
  setDefaultCharacterEmotionAction,
  updateCharacterAction
} from "@/app/(admin)/admin/actions";
import {
  AdminCard,
  AdminCardGrid,
  AdminEmptyState
} from "@/components/admin/cards";
import {
  AdminPageShell,
  Field,
  Notice,
  PageHeader,
  Pill,
  SectionCard,
  TextArea,
  TextInput
} from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { getAdminStoryData } from "@/lib/story/repository";
import { toPublicStorageUrl } from "@/lib/story/runtime";
import { getSupabaseEnv } from "@/lib/supabase/env";

type CharacterDetailPageProps = {
  params: Promise<{
    characterId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function CharacterDetailPage({
  params,
  searchParams
}: CharacterDetailPageProps) {
  const [{ characterId }, story] = await Promise.all([
    params,
    getAdminStoryData()
  ]);
  const query: Record<string, string | string[] | undefined> = searchParams
    ? await searchParams
    : {};
  const { url: supabaseUrl } = getSupabaseEnv();
  const character =
    story.characters.find((item) => item.id === characterId) ?? null;

  if (!character) {
    notFound();
  }

  const status = getParam(query.status);
  const message = getParam(query.message);
  const returnTo = `/admin/characters/${character.id}`;
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
          description="Manage the character profile and its emotion variants here while keeping the character index lightweight."
          actions={
            <Button asChild variant="outline">
              <Link href="/admin/characters">Back to Characters</Link>
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
          title="Character Settings"
          description="Edit the character name and bio here. The slug stays visible but is not the main editing surface."
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

            <form action={updateCharacterAction} className="space-y-4">
              <input type="hidden" name="characterId" value={character.id} />
              <input type="hidden" name="slug" value={character.slug} />
              <input type="hidden" name="returnTo" value={returnTo} />

              <div className="flex flex-wrap gap-2">
                <Pill>{character.emotions.length} emotions</Pill>
                <Pill>Default: {character.defaultEmotionKey}</Pill>
                <Pill>{character.slug}</Pill>
              </div>

              <Field label="Character Name" htmlFor="character-name">
                <TextInput
                  id="character-name"
                  name="name"
                  defaultValue={character.name}
                  required
                />
              </Field>

              <Field label="Bio" htmlFor="character-bio" hint="Optional.">
                <TextArea
                  id="character-bio"
                  name="bio"
                  defaultValue={character.bio ?? ""}
                />
              </Field>

              <div className="flex justify-end">
                <Button type="submit">Save Character</Button>
              </div>
            </form>
          </div>
        </SectionCard>

        <SectionCard
          title="Add Emotion"
          description="Add a new emotion image and label. Characters must always keep at least one emotion."
        >
          <form
            action={addCharacterEmotionAction}
            className="space-y-4"
            encType="multipart/form-data"
          >
            <input type="hidden" name="characterId" value={character.id} />
            <input type="hidden" name="returnTo" value={returnTo} />

            <div className="grid gap-4 lg:grid-cols-3">
              <Field label="Emotion Key" htmlFor="emotion-key">
                <TextInput
                  id="emotion-key"
                  name="emotionKey"
                  placeholder="hopeful"
                  required
                />
              </Field>

              <Field label="Emotion Label" htmlFor="emotion-label">
                <TextInput
                  id="emotion-label"
                  name="emotionLabel"
                  placeholder="Hopeful"
                  required
                />
              </Field>

              <Field label="Emotion Image" htmlFor="emotion-image">
                <TextInput
                  id="emotion-image"
                  name="imageFile"
                  type="file"
                  accept="image/*"
                  required
                />
              </Field>
            </div>

            <div className="flex justify-end">
              <Button type="submit">Add Emotion</Button>
            </div>
          </form>
        </SectionCard>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-950">Emotions</h2>
            <p className="text-sm text-slate-600">
              Emotion cards show the image, label, key, and current default
              state. Default switching happens here on the detail page.
            </p>
          </div>

          {character.emotions.length === 0 ? (
            <AdminEmptyState
              title="No Emotions Yet"
              description="Add an emotion above to populate this character."
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
                      <div className="space-y-3">
                        <p>
                          Emotion key:{" "}
                          <span className="font-medium text-slate-700">
                            {emotion.key}
                          </span>
                        </p>
                        {!isDefault ? (
                          <form action={setDefaultCharacterEmotionAction}>
                            <input
                              type="hidden"
                              name="characterId"
                              value={character.id}
                            />
                            <input
                              type="hidden"
                              name="emotionId"
                              value={emotion.id}
                            />
                            <input
                              type="hidden"
                              name="returnTo"
                              value={returnTo}
                            />
                            <Button type="submit" size="sm" variant="outline">
                              Set As Default
                            </Button>
                          </form>
                        ) : null}
                      </div>
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

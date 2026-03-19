/* eslint-disable @next/next/no-img-element */

import { createCharacterAction } from "@/app/(admin)/admin/actions";
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
  TextArea,
  TextInput
} from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { getAdminStoryData } from "@/lib/story/repository";
import { toPublicStorageUrl } from "@/lib/story/runtime";
import {
  PRIMARY_LEFT_STAGE_CHARACTER_SLUG,
  findPrimaryLeftStageCharacter
} from "@/lib/story/staging";
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
  const leftStageAnchor = findPrimaryLeftStageCharacter(story.characters);

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title="Characters"
          description="Create characters with an initial default emotion, then drill into a single character to manage its emotion variants."
        />

        {status === "success" && message ? (
          <Notice kind="success">{message}</Notice>
        ) : null}
        {status === "error" && message ? (
          <Notice kind="error">{message}</Notice>
        ) : null}

        {leftStageAnchor ? (
          <Notice kind="success">
            Runtime left-stage anchor:{" "}
            <span className="font-medium">{leftStageAnchor.name}</span>. The
            player keeps the character with slug{" "}
            <span className="font-medium">
              {PRIMARY_LEFT_STAGE_CHARACTER_SLUG}
            </span>{" "}
            on the left side when available.
          </Notice>
        ) : (
          <Notice kind="error">
            Runtime left-stage anchor missing. The current player keeps the
            character with slug{" "}
            <span className="font-medium">
              {PRIMARY_LEFT_STAGE_CHARACTER_SLUG}
            </span>{" "}
            on the left side when that character exists.
          </Notice>
        )}

        <SectionCard
          title="Create Character"
          description="Name, optional bio, and the first emotion image are enough to get a character into the authoring flow."
        >
          <form
            action={createCharacterAction}
            className="space-y-4"
          >
            <input type="hidden" name="returnTo" value="/admin/characters" />
            <input type="hidden" name="initialEmotionKey" value="default" />
            <input type="hidden" name="initialEmotionLabel" value="Default" />

            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Character Name" htmlFor="character-name">
                <TextInput
                  id="character-name"
                  name="name"
                  placeholder="Nora"
                  required
                />
              </Field>

              <Field
                label="Default Emotion Image"
                htmlFor="character-image"
                hint="The first uploaded image becomes the default emotion."
              >
                <TextInput
                  id="character-image"
                  name="imageFile"
                  type="file"
                  accept="image/*"
                  required
                />
              </Field>
            </div>

            <Field label="Bio" htmlFor="character-bio" hint="Optional.">
              <TextArea
                id="character-bio"
                name="bio"
                placeholder="Write a short character summary."
              />
            </Field>

            <div className="flex justify-end">
              <Button type="submit">Create Character</Button>
            </div>
          </form>
        </SectionCard>

        {story.characters.length === 0 ? (
          <AdminEmptyState
            title="No Characters Yet"
            description="Create the first character above to populate the cast."
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
